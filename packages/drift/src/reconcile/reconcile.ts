/**
 * The reconcile engine entry — the body of the `drift-sync` skill (AC#1). For the files worked on this
 * turn it refreshes the raw substrate, then for each affected flow dispatches HYDRATE (no `agentic.flow`
 * yet) or RE-SYNC (one exists), always updating, never gating on the user.
 *
 * Pipeline:
 *   1. Partition changed files into skill bundles (a `SKILL.md` ancestor) and plain code.
 *   2. Refresh raw: `re_extract(code, 'code-change')` (the single funnel — gives preservation for free),
 *      and `ingest_skill` per touched bundle.
 *   3. Re-induce the affected persisted flows (AC#5) and re-sync each; detect new umbrellas over the
 *      changed files and hydrate each.
 *
 * "No new drift → no-op": an empty file set, or no affected/new flows, returns an empty outcome list.
 * Writes are scoped and idempotent, so re-firing the hook (or the `stop_hook_active` re-entry) is safe.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { CallGraph, SymbolId } from "@ariadnejs/types";
import {
  build_skeleton_flows,
  build_symbol_path_index,
  induce_members,
  read_sub_agents,
  re_extract,
} from "@code-charter/core";

import { affected_persisted_flows } from "./affected_flows";
import { read_persisted_flows } from "./flow_store";
import type { PersistedFlow } from "./flow_store";
import { find_skill_root, ingest_skill_dir } from "./skill_dir";
import { hydrate_code_flow, hydrate_skill_flow } from "./hydrate";
import type { CodeUmbrella, SkillUmbrella } from "./hydrate";
import { to_abs, to_repo_relative } from "./paths";
import { is_supported_source } from "./headless_project";
import type { FlowOutcome, ReconcileDeps, ReconcileResult } from "./types";

const SKILL_FILE = "SKILL.md";
const META_FILE = "meta.json";

/** Per-turn ceiling on full (describe-bearing) code hydrations; the overflow is written as cheap stubs (AC#8). */
const MAX_FULL_CODE_HYDRATIONS = 50;

/** Reconcile the diagram store for `file_set` (absolute or repo-relative paths). */
export async function reconcile(file_set: readonly string[], deps: ReconcileDeps): Promise<ReconcileResult> {
  const changed = [...new Set(file_set.map((f) => to_repo_relative(f, deps.repo_root_abs)))]
    .filter((f) => f.length > 0 && !f.startsWith(".."))
    .sort();
  if (changed.length === 0) return { file_set: changed, outcomes: [] };

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

  // 2. Refresh raw substrate. re_extract is the single funnel (preservation for existing flows); skill
  //    bundles re-ingest their literal doc tier.
  if (code_files.length > 0) {
    re_extract(code_files, "code-change", {
      store: deps.store,
      extract_raw: deps.adapter.extract_raw,
      build_index: deps.adapter.build_index,
      analyzed_root: deps.analyzed_root,
    });
  }
  const skill_umbrellas: SkillUmbrella[] = [];
  for (const [root, name] of [...skill_roots].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    skill_umbrellas.push(build_skill_umbrella(deps, root, name));
  }

  const graph = deps.adapter.call_graph();
  const persisted = read_persisted_flows(deps.store);
  const persisted_ids = new Set(persisted.map((f) => f.node.id));
  const node_path = build_node_path_lookup(deps);

  const outcomes: FlowOutcome[] = [];
  const handled = new Set<string>();

  // 3a. Skill bundles touched this turn are detected directly from their roots and always written —
  //     HYDRATE if no flow exists yet, RE-SYNC in place if one does. (Their doc-member paths are
  //     skill-bundle-relative, so they cannot be found by the repo-relative changed-file intersection
  //     that drives code re-sync; detecting them from the touched root is the correct join.)
  for (const umbrella of skill_umbrellas) {
    const action = persisted_ids.has(umbrella.id) ? "resync" : "hydrate";
    outcomes.push({ ...(await hydrate_skill_flow(deps, umbrella)), action });
    handled.add(umbrella.id);
  }

  // 3b. RE-SYNC the persisted CODE flows whose re-induced membership intersects the changed files (AC#5).
  //     Sorted by id so the emitted outcomes are byte-stable across runs.
  const affected = affected_persisted_flows(new Set(changed), persisted, graph, deps.adapter, node_path)
    .filter((flow) => !handled.has(flow.node.id))
    .sort((a, b) => (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0));
  for (const flow of affected) {
    const outcome = await resync_persisted_flow(deps, flow, graph);
    if (outcome !== undefined) {
      outcomes.push(outcome);
      handled.add(flow.node.id);
    }
  }

  // 3c. HYDRATE new code skeleton flows touching the changed files. Bounded: the first N get the full
  //     (describe-bearing) hydration; the overflow is written as cheap singleton stubs so cost stays
  //     bounded (AC#8). The truncation is logged — never a silent cap.
  const new_code = detect_code_umbrellas(changed, code_files, graph).filter(
    (umbrella) => !persisted_ids.has(umbrella.id) && !handled.has(umbrella.id),
  );
  for (const [index, umbrella] of new_code.entries()) {
    const full = index < MAX_FULL_CODE_HYDRATIONS;
    outcomes.push(await hydrate_code_flow(deps, umbrella, graph, { allow_remap: true, describe: full }));
    handled.add(umbrella.id);
  }
  if (new_code.length > MAX_FULL_CODE_HYDRATIONS) {
    deps.log(
      `capped full hydration at ${MAX_FULL_CODE_HYDRATIONS} of ${new_code.length} new code flows; ` +
        `${new_code.length - MAX_FULL_CODE_HYDRATIONS} written as singleton stubs (no descriptions)`,
    );
  }

  return { file_set: changed, outcomes };
}

/** Re-sync one persisted CODE flow in place (idempotent) and stamp `last_synced_at`. */
async function resync_persisted_flow(
  deps: ReconcileDeps,
  flow: PersistedFlow,
  graph: CallGraph,
): Promise<FlowOutcome | undefined> {
  const seeds = stored_seed_symbol_ids(flow, graph);
  if (seeds.length === 0) {
    // The seed entrypoint is gone (deleted/renamed away). Strand the flow into the re-attachment bin so
    // it is recoverable (never silently left live and stale); a renamed seed re-hydrates as a new flow,
    // and the ≥50% overlap remap carries the user's content across.
    deps.store.soft_delete({ kind: "node", id: flow.node.id });
    deps.log(`stranded flow ${flow.node.id} (seed entrypoint gone) → re-attachment bin`);
    return undefined;
  }
  const umbrella: CodeUmbrella = {
    kind: "code",
    id: flow.node.id,
    label: typeof flow.node.attributes.label === "string" ? flow.node.attributes.label : flow.node.id,
    seeds,
  };
  return { ...(await hydrate_code_flow(deps, umbrella, graph, { allow_remap: false })), action: "resync" };
}

/** Map a code flow's stored `entry_points` (symbol_paths) back to live `SymbolId`s (the inverse of flow_id_of). */
function stored_seed_symbol_ids(flow: PersistedFlow, graph: CallGraph): SymbolId[] {
  const stored = flow.node.attributes.entry_points;
  const seed_paths = Array.isArray(stored) ? (stored as string[]) : [];
  const index = build_symbol_path_index(graph);
  const out: SymbolId[] = [];
  for (const seed_path of seed_paths) {
    const id = index.get(seed_path);
    if (id !== undefined) out.push(id);
  }
  return out;
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

/** id → repo-relative path, over every live store node (for the doc-member intersection in AC#5). */
function build_node_path_lookup(deps: ReconcileDeps): (id: string) => string | undefined {
  const by_id = new Map(deps.store.all_nodes().map((n) => [n.id, n.path]));
  return (id) => by_id.get(id);
}
