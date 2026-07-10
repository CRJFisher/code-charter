/**
 * The reconcile engine entry — the deterministic body of the `drift-sync` skill. For the files worked
 * on this turn it refreshes the raw substrate, then for each affected flow dispatches HYDRATE (no
 * `agentic.flow` yet) or RE-SYNC (one exists), always updating, never gating on the user.
 *
 * Pipeline:
 *   1. Partition changed files into skill bundles (a `SKILL.md` ancestor) and plain code.
 *   2. Refresh raw: `re_extract(code, 'code-change')` (the single funnel — relocations re-anchor
 *      inline), and `ingest_skill` per touched bundle.
 *   3. Dispatch per flow — HYDRATE, RE-SYNC, or RETIRE: re-induce the affected persisted flows (AC#5)
 *      and re-sync each; detect new umbrellas over the changed files and hydrate each; RETIRE a flow
 *      whose stored seed no longer resolves (deferred into `deferred_retirements` when the graph is
 *      untrustworthy for the seed's file) or whose seeds were demoted by a flow written this turn
 *      whose members subsume its own ({@link retire_flows_subsumed_by}). Test-rooted flows are never
 *      hydrated or re-synced: the agent-facing inventory/orphan passes skip `is_test`, so persisting
 *      one would create clutter the agent can neither stitch nor retire.
 *   4. Stale-flow sweep ({@link sweep_stale_flows}): retire the persisted flows no scoped pass can
 *      reach — a code flow whose seed files are gone from disk, a legacy test-rooted flow, and a
 *      skill flow whose SKILL.md was deleted (a bundle deletion never partitions into a skill root,
 *      so the sweep is its only retirement path). Every decision is guarded; ambiguous evidence
 *      (a still-present seed file, a degraded graph, an unreadable path) defers, never retires.
 *
 * "No new drift → no-op": an empty file set, or no affected/new flows, returns an empty outcome list.
 * Writes are scoped and idempotent, so re-firing the hook (or the `stop_hook_active` re-entry) is safe.
 *
 * The whole turn runs inside one store transaction ({@link GraphStore.transaction}, on the WAL
 * discipline from task-27.1.20.1): every mutation commits together, so a mid-turn crash rolls the turn
 * back rather than leaving it half-applied. Two guards keep a degraded input from overwriting good
 * state: the code path defers a retirement when the graph is untrustworthy for the seed's file, and
 * the skill path defers a bundle re-sync when the bundle looks degraded on disk (a truncated SKILL.md,
 * an unparseable meta.json, or a missing declared sub-agent file) — {@link assess_skill_bundle}.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { CallGraph, SymbolId } from "@ariadnejs/types";
import { build_skeleton_flows, induce_members, read_sub_agents, re_extract } from "@code-charter/core";
import type { SymbolDelta } from "@code-charter/core";

import { affected_persisted_flows } from "./affected_flows";
import { read_persisted_flows, skill_flow_id, stored_seed_paths } from "./flow_store";
import type { PersistedFlow } from "./flow_store";
import { assess_skill_bundle, find_skill_root, ingest_skill_dir, SKILL_FILE } from "./skill_dir";
import { hydrate_code_flow, hydrate_skill_flow } from "./hydrate";
import type { CodeUmbrella, SkillUmbrella } from "./hydrate";
import { to_abs, to_repo_relative } from "./paths";
import { is_supported_source } from "./headless_project";
import { assess_code_seed_loss, is_test_rooted, stored_seed_symbol_ids, sweep_stale_flows } from "./stale_flows";
import type {
  DeferredRetirement,
  DeferredSkillSync,
  DescriptionCounts,
  FlowOutcome,
  ReconcileDeps,
  ReconcileResult,
  TurnState,
} from "./types";

const META_FILE = "meta.json";

/** Per-turn ceiling on full (describe-bearing) code hydrations; the overflow is written as cheap stubs. */
const MAX_FULL_CODE_HYDRATIONS = 50;

/** Reconcile the diagram store for `file_set` (absolute or repo-relative paths). */
export async function reconcile(file_set: readonly string[], deps: ReconcileDeps): Promise<ReconcileResult> {
  const changed = [...new Set(file_set.map((f) => to_repo_relative(f, deps.repo_root_abs)))]
    .filter((f) => f.length > 0 && !f.startsWith(".."))
    .sort();
  const description_counts: DescriptionCounts = { docstring: 0, provisional: 0, placeholder: 0, llm: 0 };
  if (changed.length === 0) {
    return { file_set: changed, outcomes: [], deferred_retirements: [], deferred_skill_syncs: [], description_counts };
  }

  // The whole turn commits or rolls back as a unit (AC#1): reconcile issues many independent store
  // mutations, so a mid-turn crash under a per-statement journal would leave half a turn applied. One
  // BEGIN IMMEDIATE (built on the WAL discipline from task-27.1.20.1) makes the turn atomic.
  return deps.store.transaction(() => reconcile_turn(changed, description_counts, deps));
}

/** One reconcile turn's body, run inside the single turn transaction opened by {@link reconcile}. */
async function reconcile_turn(
  changed: readonly string[],
  description_counts: DescriptionCounts,
  deps: ReconcileDeps,
): Promise<ReconcileResult> {
  // 1. Partition: a file under a SKILL.md ancestor belongs to that bundle; everything else is code.
  const skill_roots = new Map<string, string>(); // abs skill root → skill name (basename)
  const code_files: string[] = [];
  for (const rel of changed) {
    const skill_root = find_skill_root(to_abs(rel, deps.repo_root_abs), deps.repo_root_abs);
    if (skill_root !== undefined) {
      skill_roots.set(skill_root, skill_root.split(/[\\/]/).filter(Boolean).pop() ?? skill_root);
    } else if (is_supported_source(rel)) {
      code_files.push(rel);
    }
  }

  // 2. Refresh raw substrate. re_extract is the single funnel (preservation for existing flows) and
  //    emits the turn's symbol delta; skill bundles re-ingest their literal doc tier.
  let delta: SymbolDelta = { added: [], removed: [], modified: [], relocated: [] };
  if (code_files.length > 0) {
    delta = re_extract(code_files, "code-change", {
      store: deps.store,
      extract_raw: deps.adapter.extract_raw,
      build_index: deps.adapter.build_index,
      analyzed_root: deps.analyzed_root,
      log: deps.log,
    }).delta;
  }
  // A degraded bundle on disk (truncated SKILL.md, missing sub-agent file) is DEFERRED, not ingested:
  // ingesting it would overwrite the good flow with a shrunken snapshot (AC#2). The good flow is left
  // intact and the sync retries on the next turn that touches the bundle — the code path's
  // trustworthy-graph gate, mirrored onto the skill path.
  const deferred_skill_syncs: DeferredSkillSync[] = [];
  const skill_umbrellas: SkillUmbrella[] = [];
  for (const [root, name] of [...skill_roots].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const defect = assess_skill_bundle(root);
    if (defect !== undefined) {
      const flow_id = skill_flow_id(name);
      deferred_skill_syncs.push({ flow_id, reason: defect });
      deps.log(`deferred skill sync of ${flow_id}: ${defect}`);
      continue;
    }
    skill_umbrellas.push(build_skill_umbrella(deps, root, name));
  }

  const graph = deps.adapter.call_graph();
  const persisted = read_persisted_flows(deps.store);
  const persisted_ids = new Set(persisted.map((f) => f.node.id));

  const outcomes: FlowOutcome[] = [];
  const deferred_retirements: DeferredRetirement[] = [];
  const handled = new Set<string>();
  const retired = new Set<string>();
  const state: TurnState = { outcomes, handled, retired };

  // 3a. Skill bundles touched this turn are detected directly from their roots and always written —
  //     HYDRATE if no flow exists yet, RE-SYNC in place if one does. (Their doc-member paths are
  //     skill-bundle-relative, so they cannot be found by the repo-relative changed-file intersection
  //     that drives code re-sync; detecting them from the touched root is the correct join.)
  for (const umbrella of skill_umbrellas) {
    const action = persisted_ids.has(umbrella.id) ? "resync" : "hydrate";
    const reason =
      action === "resync" ? "skill bundle files touched this turn (re-ingested in place)" : "skill bundle first touched this turn";
    outcomes.push({ ...(await hydrate_skill_flow(deps, umbrella)), action, reason });
    handled.add(umbrella.id);
  }

  // 3b. RE-SYNC the persisted CODE flows whose body or membership drifted this turn (task-27.1.6.4 AC#2).
  //     The delta drives this: its `modified` class maps to the body-drift trigger (a changed body is a
  //     member), while `added`/`removed`/`relocated` reshape a flow's induced member set and are realized
  //     by the membership-drift trigger inside affected_persisted_flows (a relocated member's description
  //     was already re-anchored inline by re_extract, so the re-describe pass is a content-hash cache
  //     hit). Sorted by id so the emitted outcomes are byte-stable.
  //     A test-rooted flow is excluded: re-syncing it would keep never-hydratable clutter alive, so
  //     it falls through un-handled to the stale-flow sweep, which retires it.
  const body_modified_ids = body_modified_member_ids(deps, code_files, delta);
  const affected = affected_persisted_flows(body_modified_ids, persisted, graph, new Set(changed))
    .filter((flow) => !handled.has(flow.node.id) && !is_test_rooted(flow, graph))
    .sort((a, b) => (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0));
  for (const flow of affected) {
    // A flow can be retired mid-loop by an earlier iteration's demotion check; re-syncing it here
    // would resurrect the soft-deleted node (write_flow upserts deleted_at: null) — skip it.
    if (handled.has(flow.node.id)) continue;
    const result = await resync_persisted_flow(deps, flow, graph);
    if (result.kind === "outcome") {
      outcomes.push(result.outcome);
      add_description_counts(description_counts, result.description_counts);
      handled.add(flow.node.id);
      if (result.outcome.action === "retire") retired.add(flow.node.id);
      else retire_flows_subsumed_by(deps, flow.node.id, result.seeds, persisted, graph, state);
    } else {
      deferred_retirements.push(result.deferred);
      deps.log(`deferred retirement of ${result.deferred.flow_id}: ${result.deferred.reason}`);
    }
  }

  // 3c. HYDRATE new code skeleton flows touching the changed files, one flow per entrypoint —
  //     deterministic. A functionality Ariadne fragmented across unresolved call sites hydrates as
  //     several singleton flows here; the drift-sync skill's stitch phase (`--apply-stitch`) later
  //     merges those fragments into one multi-seed umbrella and retires the absorbed singletons.
  //     A skeleton flow whose entrypoint is already a stored seed of a live flow is not new — its
  //     fragment was absorbed by a stitched umbrella, and re-hydrating it would resurrect the
  //     retired singleton (the seed stays a live graph entrypoint forever, so the demotion-based
  //     retire in retire_flows_subsumed_by can never reclaim it). Bounded: the first N get the
  //     full (describe-bearing) hydration; the overflow is written as cheap singleton stubs. The
  //     truncation is logged — never a silent cap.
  const claimed_seed_paths = new Set(persisted.flatMap((flow) => stored_seed_paths(flow)));
  const all_new_code = detect_code_umbrellas(changed, code_files, graph);
  const new_code = all_new_code.filter(
    (umbrella) =>
      !persisted_ids.has(umbrella.id) && !claimed_seed_paths.has(umbrella.id) && !handled.has(umbrella.id),
  );
  for (const [index, umbrella] of new_code.entries()) {
    const full = index < MAX_FULL_CODE_HYDRATIONS;
    const hydrated = await hydrate_code_flow(deps, umbrella, graph, { describe: full });
    outcomes.push(
      full
        ? hydrated.outcome
        : { ...hydrated.outcome, reason: "new entrypoint (singleton stub: over the full-hydration cap)" },
    );
    add_description_counts(description_counts, hydrated.description_counts);
    handled.add(umbrella.id);
    retire_flows_subsumed_by(deps, umbrella.id, umbrella.seeds, persisted, graph, state);
  }
  if (new_code.length > MAX_FULL_CODE_HYDRATIONS) {
    deps.log(
      `capped full hydration at ${MAX_FULL_CODE_HYDRATIONS} of ${new_code.length} new code flows; ` +
        `${new_code.length - MAX_FULL_CODE_HYDRATIONS} written as singleton stubs (no descriptions)`,
    );
  }

  // 4. Stale-flow sweep — the retirement path for flows no scoped pass reaches (see module header).
  sweep_stale_flows(deps, persisted, graph, state, deferred_retirements);

  return { file_set: changed, outcomes, deferred_retirements, deferred_skill_syncs, description_counts };
}

type ResyncResult =
  | { kind: "outcome"; outcome: FlowOutcome; seeds: readonly SymbolId[]; description_counts: DescriptionCounts }
  | { kind: "deferred"; deferred: DeferredRetirement };

function add_description_counts(total: DescriptionCounts, part: DescriptionCounts): void {
  total.docstring += part.docstring;
  total.provisional += part.provisional;
  total.placeholder += part.placeholder;
  total.llm += part.llm;
}

/**
 * Retire persisted flows superseded by a flow written this turn (task-27.1.15.3): a candidate is
 * retired when none of its stored seeds is still an entry point of the live graph (each demoted to a
 * non-entrypoint — typically by a new wrapper caller) AND its member set is subsumed by the
 * just-written flow's. The conjunction protects coexisting genuine entrypoint flows that merely
 * share members: each still owns a live entrypoint, so demotion never holds for them.
 *
 * On-demand by construction: it runs only when a flow was hydrated or re-synced this turn, against
 * the persisted list already in memory — never as a sweep over untouched flows. A candidate whose
 * seeds no longer resolve at all is the seed-gone path's case and is skipped here.
 *
 * Retirement also fires from the scoped seed-gone path ({@link resync_persisted_flow}), the global
 * stale-flow sweep (`stale_flows.ts`), and `apply_stitch` (agentic_modes.ts), which retires the
 * singleton flows an agent-judged umbrella absorbs directly by seed id — those seeds stay live
 * entrypoints, so the demotion conjunction here can never fire for them.
 */
function retire_flows_subsumed_by(
  deps: ReconcileDeps,
  new_flow_id: string,
  new_flow_seeds: readonly SymbolId[],
  persisted: readonly PersistedFlow[],
  graph: CallGraph,
  state: TurnState,
): void {
  if (new_flow_seeds.length === 0) return;
  const entry_points = new Set(graph.entry_points);
  let new_members: Set<SymbolId> | undefined; // induced lazily, once, only if a demoted candidate exists
  const candidates = [...persisted].sort((a, b) => (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0));
  for (const other of candidates) {
    if (other.node.id === new_flow_id || state.retired.has(other.node.id)) continue;
    if (other.member_edges.length > 0) continue; // skill/doc flow — never code-subsumed
    const other_seeds = stored_seed_symbol_ids(other, graph);
    if (other_seeds.length === 0) continue; // seed gone — the scoped seed-gone path owns that case
    if (other_seeds.some((seed) => entry_points.has(seed))) continue; // still owns a live entrypoint
    new_members ??= induce_members({ id: new_flow_id, seeds: [...new_flow_seeds] }, graph);
    const other_members = induce_members({ id: other.node.id, seeds: other_seeds }, graph);
    let subsumed = true;
    for (const member of other_members) {
      if (!new_members.has(member)) {
        subsumed = false;
        break;
      }
    }
    if (!subsumed) continue;

    deps.store.soft_delete({ kind: "node", id: other.node.id });
    deps.log(`retired flow ${other.node.id} (seed entrypoint demoted; subsumed by ${new_flow_id})`);
    // One truthful record per flow: a same-turn resync of the now-superseded flow is dropped in
    // favour of the retire record (the store writes net out to retired either way).
    const earlier = state.outcomes.findIndex((outcome) => outcome.flow_id === other.node.id);
    if (earlier !== -1) state.outcomes.splice(earlier, 1);
    state.outcomes.push({
      flow_id: other.node.id,
      action: "retire",
      kind: "code",
      member_count: 0,
      last_synced_at: null,
      reason: `seed entrypoint demoted; subsumed by ${new_flow_id}`,
    });
    state.handled.add(other.node.id);
    state.retired.add(other.node.id);
  }
}

/**
 * Re-sync one persisted CODE flow in place (idempotent) and stamp `last_synced_at`. A flow whose seed
 * no longer resolves is retired (soft-deleted) — but only on trustworthy evidence: a degraded graph
 * or an unreadable/mid-edit seed file defers instead ({@link assess_code_seed_loss}). A renamed seed
 * re-hydrates as a fresh flow under its new id.
 */
async function resync_persisted_flow(
  deps: ReconcileDeps,
  flow: PersistedFlow,
  graph: CallGraph,
): Promise<ResyncResult> {
  const seeds = stored_seed_symbol_ids(flow, graph);
  if (seeds.length === 0) {
    const assessment = assess_code_seed_loss(deps, flow, graph, "scoped");
    if (assessment.kind === "defer") {
      return { kind: "deferred", deferred: { flow_id: flow.node.id, reason: assessment.reason } };
    }
    deps.store.soft_delete({ kind: "node", id: flow.node.id });
    deps.log(`retired flow ${flow.node.id} (seed entrypoint gone)`);
    return {
      kind: "outcome",
      outcome: {
        flow_id: flow.node.id,
        action: "retire",
        kind: "code",
        member_count: 0,
        last_synced_at: null,
        reason: assessment.reason,
      },
      seeds: [],
      description_counts: { docstring: 0, provisional: 0, placeholder: 0, llm: 0 },
    };
  }
  const umbrella: CodeUmbrella = {
    kind: "code",
    id: flow.node.id,
    label: typeof flow.node.attributes.label === "string" ? flow.node.attributes.label : flow.node.id,
    seeds,
  };
  const hydrated = await hydrate_code_flow(deps, umbrella, graph);
  return {
    kind: "outcome",
    outcome: { ...hydrated.outcome, action: "resync", reason: "body or membership drifted this turn" },
    seeds,
    description_counts: hydrated.description_counts,
  };
}

/** Skeleton flows whose induced membership intersects the changed code files — the code hydrate candidates. */
function detect_code_umbrellas(changed: readonly string[], code_files: readonly string[], graph: CallGraph): CodeUmbrella[] {
  if (code_files.length === 0) return [];
  const changed_set = new Set(changed);
  const umbrellas: CodeUmbrella[] = [];
  for (const flow of build_skeleton_flows(graph)) {
    if (flow.is_unattributed) continue;
    // A test entrypoint's tree reaches the product code it exercises, so a changed product file
    // would otherwise hydrate every test rooted over it — clutter the inventory/orphan passes
    // (which skip is_test) could never stitch or retire.
    if (graph.nodes.get(flow.seeds[0])?.is_test === true) continue;
    const members = induce_members({ id: flow.id, seeds: flow.seeds }, graph);
    let touches = false;
    for (const member of members) {
      const node = graph.nodes.get(member);
      if (node !== undefined && changed_set.has(node.location.file_path)) {
        touches = true;
        break;
      }
    }
    if (touches) umbrellas.push({ kind: "code", id: flow.id, label: flow.label, seeds: flow.seeds });
  }
  return umbrellas;
}

/** Build one {@link SkillUmbrella} by ingesting the bundle's literal doc tier. */
function build_skill_umbrella(deps: ReconcileDeps, skill_root_abs: string, skill_name: string): SkillUmbrella {
  const result = ingest_skill_dir(deps.store, skill_root_abs);
  let meta_json_source: string | null = null;
  try {
    meta_json_source = fs.readFileSync(path.join(skill_root_abs, META_FILE), "utf-8");
  } catch {
    meta_json_source = null;
  }
  const doc_id = (rel: string): string => `${skill_name}/${rel}#doc`;
  const resolve_subagent = (name: string): string | undefined => {
    if (meta_json_source === null) return undefined;
    const decl = read_sub_agents(meta_json_source).find((d) => d.name === name);
    if (decl?.file == null) return undefined;
    const id = doc_id(decl.file.replace(/\\/g, "/"));
    return result.doc_node_ids.includes(id) ? id : undefined;
  };
  return {
    kind: "skill",
    id: skill_flow_id(skill_name),
    label: skill_name,
    skill_root: to_repo_relative(skill_root_abs, deps.repo_root_abs),
    skill_doc_id: doc_id(SKILL_FILE),
    doc_node_ids: result.doc_node_ids,
    meta_json_source,
    meta_json_path: `${skill_name}/${META_FILE}`,
    resolve_subagent,
  };
}

/**
 * The live `SymbolId`s of this turn's body-modified symbols — the body-drift re-sync trigger
 * (task-27.1.6.4 AC#2). Added/removed/relocated members are caught by the membership-diff trigger inside
 * `affected_persisted_flows`, so only `modified` needs the symbol_path → SymbolId join here. The join
 * goes through `anchored_symbols` (the one place a resolver `symbol_path` is paired with a call-graph id).
 */
function body_modified_member_ids(deps: ReconcileDeps, code_files: readonly string[], delta: SymbolDelta): Set<SymbolId> {
  if (delta.modified.length === 0) return new Set();
  const path_to_id = new Map(deps.adapter.anchored_symbols([...code_files]).map((a) => [a.symbol_path, a.symbol_id]));
  const ids = new Set<SymbolId>();
  const unjoined: string[] = [];
  for (const symbol_path of delta.modified) {
    const id = path_to_id.get(symbol_path);
    if (id !== undefined) ids.add(id);
    else unjoined.push(symbol_path);
  }
  // A modified body whose symbol_path finds no call-graph id cannot drive its flow's body-drift
  // re-sync — the flow silently stays stale. Made loud so the two-id-space seam is observable.
  if (unjoined.length > 0) {
    deps.log(
      `body-drift: ${unjoined.length} modified symbol(s) missed the anchored_symbols join ` +
        `(flows containing them stay stale): ${unjoined.sort().join(", ")}`,
    );
  }
  return ids;
}
