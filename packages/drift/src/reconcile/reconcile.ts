/**
 * The reconcile engine entry — the body of the `drift-sync` skill (AC#1). For the files worked on this
 * turn it refreshes the raw substrate, then for each affected flow dispatches HYDRATE (no `agentic.flow`
 * yet) or RE-SYNC (one exists), always updating, never gating on the user.
 *
 * Pipeline:
 *   1. Partition changed files into skill bundles (a `SKILL.md` ancestor) and plain code.
 *   2. Refresh raw: `re_extract(code, 'code-change')` (the single funnel — relocations re-anchor
 *      inline), and `ingest_skill` per touched bundle.
 *   3. Dispatch per flow — HYDRATE, RE-SYNC, or RETIRE: re-induce the affected persisted flows (AC#5)
 *      and re-sync each; detect new umbrellas over the changed files and hydrate each; RETIRE a flow
 *      whose stored seed no longer resolves (deferred into `deferred_retirements` when the graph is
 *      untrustworthy for the seed's file) or whose seeds were demoted by a flow written this turn
 *      whose members subsume its own ({@link retire_flows_subsumed_by}).
 *
 * "No new drift → no-op": an empty file set, or no affected/new flows, returns an empty outcome list.
 * Writes are scoped and idempotent, so re-firing the hook (or the `stop_hook_active` re-entry) is safe.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { CallGraph, SymbolId } from "@ariadnejs/types";
import {
  build_candidate_stitches,
  build_skeleton_flows,
  build_symbol_path_index,
  induce_members,
  MAX_STITCH_CANDIDATES,
  null_stitch_executor,
  paths_of,
  read_sub_agents,
  re_extract,
  STITCH_EXTRACTOR_ID,
  STITCH_EXTRACTOR_VERSION,
} from "@code-charter/core";
import type { BridgeCandidate, CandidateSeed, ConfirmedStitch, StitchBatch, SymbolDelta } from "@code-charter/core";

import { affected_persisted_flows } from "./affected_flows";
import { read_persisted_flows, stored_seed_files, stored_seed_paths } from "./flow_store";
import type { PersistedFlow } from "./flow_store";
import { find_skill_root, ingest_skill_dir } from "./skill_dir";
import { hydrate_code_flow, hydrate_skill_flow } from "./hydrate";
import type { CodeUmbrella, SkillUmbrella } from "./hydrate";
import { to_abs, to_repo_relative } from "./paths";
import { is_supported_source } from "./headless_project";
import type { DeferredRetirement, FlowOutcome, ReconcileDeps, ReconcileResult } from "./types";

const SKILL_FILE = "SKILL.md";
const META_FILE = "meta.json";

/** Per-turn ceiling on full (describe-bearing) code hydrations; the overflow is written as cheap stubs (AC#8). */
const MAX_FULL_CODE_HYDRATIONS = 50;

/** Reconcile the diagram store for `file_set` (absolute or repo-relative paths). */
export async function reconcile(file_set: readonly string[], deps: ReconcileDeps): Promise<ReconcileResult> {
  const changed = [...new Set(file_set.map((f) => to_repo_relative(f, deps.repo_root_abs)))]
    .filter((f) => f.length > 0 && !f.startsWith(".."))
    .sort();
  if (changed.length === 0) return { file_set: changed, outcomes: [], deferred_retirements: [] };

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
  const skill_umbrellas: SkillUmbrella[] = [];
  for (const [root, name] of [...skill_roots].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
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
    outcomes.push({ ...(await hydrate_skill_flow(deps, umbrella)), action });
    handled.add(umbrella.id);
  }

  // 3b. RE-SYNC the persisted CODE flows whose body or membership drifted this turn (task-27.1.6.4 AC#2).
  //     The delta drives this: its `modified` class maps to the body-drift trigger (a changed body is a
  //     member), while `added`/`removed`/`relocated` reshape a flow's induced member set and are realized
  //     by the membership-drift trigger inside affected_persisted_flows (a relocated member's description
  //     was already re-anchored inline by re_extract, so the re-describe pass is a content-hash cache
  //     hit). Sorted by id so the emitted outcomes are byte-stable.
  const body_modified_ids = body_modified_member_ids(deps, code_files, delta);
  const affected = affected_persisted_flows(body_modified_ids, persisted, graph, new Set(changed))
    .filter((flow) => !handled.has(flow.node.id))
    .sort((a, b) => (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0));
  for (const flow of affected) {
    // A flow can be retired mid-loop by an earlier iteration's demotion check; re-syncing it here
    // would resurrect the soft-deleted node (write_flow upserts deleted_at: null) — skip it.
    if (handled.has(flow.node.id)) continue;
    const result = await resync_persisted_flow(deps, flow, graph);
    if (result.kind === "outcome") {
      outcomes.push(result.outcome);
      handled.add(flow.node.id);
      if (result.outcome.action === "retire") retired.add(flow.node.id);
      else retire_flows_subsumed_by(deps, flow.node.id, result.seeds, persisted, graph, state);
    } else {
      deferred_retirements.push(result.deferred);
      deps.log(`deferred retirement of ${result.deferred.flow_id}: ${result.deferred.reason}`);
    }
  }

  // 3c. HYDRATE new code skeleton flows touching the changed files. Orphan entrypoints are first
  //     proposed as candidate stitches; the stitch_entrypoints executor (defaults to
  //     null_stitch_executor — confirms nothing, one-entrypoint-per-flow) judges each pair and
  //     confirms merges into multi-seed umbrellas. Bounded: the first N get the full
  //     (describe-bearing) hydration; the overflow is written as cheap singleton stubs (AC#8). The
  //     truncation is logged — never a silent cap.
  const all_new_code = await detect_and_stitch_code_umbrellas(deps, changed, code_files, graph);
  const new_code = all_new_code.filter(
    (umbrella) => !persisted_ids.has(umbrella.id) && !handled.has(umbrella.id),
  );
  for (const [index, umbrella] of new_code.entries()) {
    const full = index < MAX_FULL_CODE_HYDRATIONS;
    outcomes.push(await hydrate_code_flow(deps, umbrella, graph, { describe: full }));
    handled.add(umbrella.id);
    retire_flows_subsumed_by(deps, umbrella.id, umbrella.seeds, persisted, graph, state);
  }
  if (new_code.length > MAX_FULL_CODE_HYDRATIONS) {
    deps.log(
      `capped full hydration at ${MAX_FULL_CODE_HYDRATIONS} of ${new_code.length} new code flows; ` +
        `${new_code.length - MAX_FULL_CODE_HYDRATIONS} written as singleton stubs (no descriptions)`,
    );
  }

  return { file_set: changed, outcomes, deferred_retirements };
}

type ResyncResult =
  | { kind: "outcome"; outcome: FlowOutcome; seeds: readonly SymbolId[] }
  | { kind: "deferred"; deferred: DeferredRetirement };

/** The turn's accumulating record, shared with the demotion-retirement check. */
interface TurnState {
  outcomes: FlowOutcome[];
  handled: Set<string>;
  retired: Set<string>;
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
    });
    state.handled.add(other.node.id);
    state.retired.add(other.node.id);
  }
}

/**
 * Re-sync one persisted CODE flow in place (idempotent) and stamp `last_synced_at`. A flow whose seed
 * no longer resolves is retired (soft-deleted) — but only on a trustworthy graph: when the graph came
 * back empty, the seed's own file was omitted by a read/index failure, or the file is still on disk
 * but yields no indexed symbols at all (a mid-edit syntax error typically parses without throwing
 * and just drops the definitions), the retirement is deferred and retried naturally on the next
 * turn that touches the file. A partially broken file that still yields some symbols is
 * indistinguishable from a genuine deletion and retires; the flow re-hydrates under the same id
 * once the file parses again.
 */
async function resync_persisted_flow(
  deps: ReconcileDeps,
  flow: PersistedFlow,
  graph: CallGraph,
): Promise<ResyncResult> {
  const seeds = stored_seed_symbol_ids(flow, graph);
  if (seeds.length === 0) {
    if (graph.nodes.size === 0) {
      return { kind: "deferred", deferred: { flow_id: flow.node.id, reason: "empty call graph" } };
    }
    const omitted = deps.adapter.omitted_files();
    for (const file of stored_seed_files(flow)) {
      if (omitted.has(file)) {
        return {
          kind: "deferred",
          deferred: { flow_id: flow.node.id, reason: `seed file omitted from graph: ${file}` },
        };
      }
      if (fs.existsSync(to_abs(file, deps.repo_root_abs)) && deps.adapter.anchored_symbols([file]).length === 0) {
        return {
          kind: "deferred",
          deferred: { flow_id: flow.node.id, reason: `seed file present but yields no indexed symbols: ${file}` },
        };
      }
    }
    // The seed entrypoint is gone (deleted, or renamed away). The flow is superseded, so retire it
    // (soft-delete) rather than leave it live and stale; a renamed seed re-hydrates as a fresh flow
    // under its new id.
    deps.store.soft_delete({ kind: "node", id: flow.node.id });
    deps.log(`retired flow ${flow.node.id} (seed entrypoint gone)`);
    return {
      kind: "outcome",
      outcome: { flow_id: flow.node.id, action: "retire", kind: "code", member_count: 0, last_synced_at: null },
      seeds: [],
    };
  }
  const umbrella: CodeUmbrella = {
    kind: "code",
    id: flow.node.id,
    label: typeof flow.node.attributes.label === "string" ? flow.node.attributes.label : flow.node.id,
    seeds,
  };
  return {
    kind: "outcome",
    outcome: { ...(await hydrate_code_flow(deps, umbrella, graph)), action: "resync" },
    seeds,
  };
}

/** Map a code flow's stored `entry_points` (symbol_paths) back to live `SymbolId`s (the inverse of flow_id_of). */
function stored_seed_symbol_ids(flow: PersistedFlow, graph: CallGraph): SymbolId[] {
  const index = build_symbol_path_index(graph);
  const out: SymbolId[] = [];
  for (const seed_path of stored_seed_paths(flow)) {
    const id = index.get(seed_path);
    if (id !== undefined) out.push(id);
  }
  return out;
}

/**
 * Stitch-aware code umbrella detection (AC#1). Runs `build_candidate_stitches` over the changed
 * neighbourhood, calls the executor on the candidates (capped at MAX_STITCH_CANDIDATES — AC#8), then
 * assembles multi-seed umbrellas for confirmed stitches. Unconfirmed or overflow candidates fall back
 * to singleton flows. Non-orphan skeleton flows (doc-linked) are carried through unchanged.
 */
async function detect_and_stitch_code_umbrellas(
  deps: ReconcileDeps,
  changed: readonly string[],
  code_files: readonly string[],
  graph: CallGraph,
): Promise<CodeUmbrella[]> {
  if (code_files.length === 0) return [];

  const changed_set = new Set(changed);
  const doc_edges = deps.store.all_edges();
  const batch = build_candidate_stitches(changed_set, graph, doc_edges);

  if (batch.total_pairs > batch.candidates.length) {
    deps.log(
      `stitch: capped ${batch.total_pairs} candidate pair(s) to ${MAX_STITCH_CANDIDATES}; ` +
        `${batch.total_pairs - batch.candidates.length} pair(s) fall back to singleton flows`,
    );
  }

  const executor = deps.stitch_entrypoints ?? null_stitch_executor;
  const confirmed = batch.candidates.length > 0
    ? await executor(batch.candidates, deps.goal ?? "orient-in-code-tree")
    : [];

  // Union-find: merge confirmed stitches that share seeds into single umbrella groups
  const groups = build_stitch_groups(confirmed, batch, graph);
  const stitched_seed_ids = new Set(groups.flatMap((g) => g.seed_ids));

  // Merged multi-seed umbrellas from confirmed stitches
  const merged_umbrellas: CodeUmbrella[] = groups.map((g) => ({
    kind: "code",
    id: g.dominant_id,
    label: g.label,
    seeds: g.all_seeds,
    bridges: g.bridge_candidates,
    rationale: g.rationale,
  }));

  // Singleton fallbacks for neighbourhood seeds not merged into any group
  const singleton_umbrellas: CodeUmbrella[] = batch.neighbourhood_seeds
    .filter((seed: CandidateSeed) => !stitched_seed_ids.has(seed.id))
    .map((seed: CandidateSeed) => ({ kind: "code", id: seed.id, label: seed.label, seeds: [...seed.seeds] }));

  // Non-orphan skeleton flows (doc-linked): keep using the deterministic path; filter out any that
  // were already handled by the stitch path (by id match) to avoid double-hydration.
  const orphan_ids = new Set(batch.neighbourhood_seeds.map((s: CandidateSeed) => s.id));
  const non_orphan_umbrellas = detect_code_umbrellas(changed, code_files, graph).filter(
    (u) => !orphan_ids.has(u.id),
  );

  // Filter merged + singleton umbrellas by "touches changed files"
  const touches_changed = (umbrella: CodeUmbrella): boolean => {
    const members = induce_members({ id: umbrella.id, seeds: [...umbrella.seeds] }, graph);
    for (const member of members) {
      const node = graph.nodes.get(member);
      if (node !== undefined && changed_set.has(node.location.file_path)) return true;
    }
    return false;
  };

  return [
    ...merged_umbrellas.filter(touches_changed),
    ...singleton_umbrellas.filter(touches_changed),
    ...non_orphan_umbrellas,
  ];
}

interface StitchGroup {
  /** The dominant seed's symbol_path — used as the umbrella id. */
  dominant_id: string;
  /** All CandidateSeed.ids in this group (for tracking handled seeds). */
  seed_ids: readonly string[];
  all_seeds: readonly SymbolId[];
  label: string;
  rationale: string;
  bridge_candidates: readonly BridgeCandidate[];
}

/**
 * Merge confirmed stitches that share seeds (union-find). Seeds within one confirmed stitch are
 * unioned; two groups sharing any seed collapse into one. The dominant seed is the alphabetically
 * smallest `CandidateSeed.id` in the group (deterministic). Bridge endpoints are converted from
 * Ariadne SymbolIds to rename-stable symbol_paths so persisted edges live in the store's id space.
 */
function build_stitch_groups(
  confirmed: readonly ConfirmedStitch[],
  batch: StitchBatch,
  graph: CallGraph,
): StitchGroup[] {
  if (confirmed.length === 0) return [];

  // Map: SymbolId → CandidateSeed.id (a symbol_path)
  const sym_to_seed_id = new Map<SymbolId, string>();
  for (const seed of batch.neighbourhood_seeds) {
    for (const sym of seed.seeds) sym_to_seed_id.set(sym, seed.id);
  }

  // Map: CandidateSeed.id → SymbolId[]
  const syms_of = new Map<string, SymbolId[]>();
  for (const seed of batch.neighbourhood_seeds) syms_of.set(seed.id, [...seed.seeds]);

  // Union-find on CandidateSeed.ids; smaller id becomes root (deterministic)
  const parent = new Map<string, string>();
  function find(id: string): string {
    if (!parent.has(id)) parent.set(id, id);
    const p = parent.get(id)!;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  }
  function union(a: string, b: string): void {
    const ra = find(a), rb = find(b);
    if (ra !== rb) {
      if (ra < rb) parent.set(rb, ra);
      else parent.set(ra, rb);
    }
  }

  const bridges_by_root = new Map<string, BridgeCandidate[]>();
  const label_by_root = new Map<string, string>();
  const rationale_by_root = new Map<string, string>();
  // Track which pre-union roots had at least one confirmed stitch (independent of bridges,
  // so a stitch with unresolvable bridge endpoints still merges its seeds).
  const confirmed_roots = new Set<string>();

  for (const stitch of confirmed) {
    const seed_ids: string[] = [
      ...new Set(
        stitch.merged_seeds
          .map((sym: SymbolId) => sym_to_seed_id.get(sym))
          .filter((id: string | undefined): id is string => id !== undefined),
      ),
    ];
    if (seed_ids.length < 2) continue; // malformed stitch — skip
    for (let i = 1; i < seed_ids.length; i++) union(seed_ids[0], seed_ids[i]);

    const root = find(seed_ids[0]);
    confirmed_roots.add(root);
    label_by_root.set(root, stitch.label);
    rationale_by_root.set(root, stitch.inference_rationale);

    // Convert bridge endpoints from SymbolId to symbol_path for store-stable, rename-safe ids.
    // dst: target seed's CandidateSeed.id is already a symbol_path; fall back to paths_of.
    const src_symbol_paths = paths_of(new Set([stitch.bridge.src_symbol_id]), graph);
    const dst_symbol_path =
      sym_to_seed_id.get(stitch.bridge.dst_symbol_id) ??
      paths_of(new Set([stitch.bridge.dst_symbol_id]), graph)[0];
    if (src_symbol_paths.length > 0 && dst_symbol_path !== undefined) {
      if (!bridges_by_root.has(root)) bridges_by_root.set(root, []);
      bridges_by_root.get(root)!.push({
        src_id: src_symbol_paths[0],
        dst_id: dst_symbol_path,
        inference_rationale: stitch.inference_rationale,
        provenance: {
          source_file: stitch.bridge.source_file,
          source_range: stitch.bridge.source_range,
          extractor_id: STITCH_EXTRACTOR_ID,
          extractor_version: STITCH_EXTRACTOR_VERSION,
        },
      });
    }
  }

  // Re-key bridges/labels/rationales after all unions (roots may have changed)
  const final_bridges = new Map<string, BridgeCandidate[]>();
  const final_labels = new Map<string, string>();
  const final_rationales = new Map<string, string>();
  for (const [old_root, bs] of bridges_by_root) {
    const root = find(old_root);
    const existing = final_bridges.get(root);
    if (existing) existing.push(...bs);
    else final_bridges.set(root, [...bs]);
  }
  for (const [old_root, v] of label_by_root) {
    const root = find(old_root);
    final_labels.set(root, v);
  }
  for (const [old_root, v] of rationale_by_root) {
    const root = find(old_root);
    final_rationales.set(root, v);
  }
  // Final confirmed roots after all unions
  const confirmed_final_roots = new Set([...confirmed_roots].map((r) => find(r)));

  // Build one StitchGroup per root that has ≥2 seeds
  const groups_by_root = new Map<string, { seed_ids: Set<string>; all_syms: Set<SymbolId> }>();
  for (const seed of batch.neighbourhood_seeds) {
    const root = find(seed.id);
    if (!confirmed_final_roots.has(root)) continue; // this seed is not in any confirmed stitch
    if (!groups_by_root.has(root)) groups_by_root.set(root, { seed_ids: new Set(), all_syms: new Set() });
    const g = groups_by_root.get(root)!;
    g.seed_ids.add(seed.id);
    for (const sym of syms_of.get(seed.id) ?? []) g.all_syms.add(sym);
  }

  const groups: StitchGroup[] = [];
  for (const [root, g] of [...groups_by_root].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (g.seed_ids.size < 2) continue; // executor returned a stitch but seeds didn't resolve — skip
    const seed_ids = [...g.seed_ids].sort();
    groups.push({
      dominant_id: seed_ids[0], // alphabetically first = stable dominant
      seed_ids,
      all_seeds: [...g.all_syms].sort(),
      label: final_labels.get(root) ?? seed_ids[0],
      rationale: final_rationales.get(root) ?? "agent-confirmed entrypoint stitch",
      bridge_candidates: final_bridges.get(root) ?? [],
    });
  }

  return groups;
}

/** Skeleton flows whose induced membership intersects the changed code files — the code hydrate candidates. */
function detect_code_umbrellas(changed: readonly string[], code_files: readonly string[], graph: CallGraph): CodeUmbrella[] {
  if (code_files.length === 0) return [];
  const changed_set = new Set(changed);
  const umbrellas: CodeUmbrella[] = [];
  for (const flow of build_skeleton_flows(graph)) {
    if (flow.is_unattributed) continue;
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
    // Namespaced so the flow node never collides with the SKILL.md doc node (which it includes as a member).
    id: `agentic.flow:skill:${skill_name}`,
    label: skill_name,
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
  for (const symbol_path of delta.modified) {
    const id = path_to_id.get(symbol_path);
    if (id !== undefined) ids.add(id);
  }
  return ids;
}
