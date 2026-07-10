/**
 * The stale-flow sweep — the global counterpart to `affected_flows.ts`'s scoped membership
 * resolution: which persisted flows can no longer legitimately exist, regardless of whether this
 * turn's change touched them. Three stale shapes:
 *
 *  - a CODE flow none of whose stored seeds resolves in the live graph (seed deleted or renamed
 *    away out-of-band — the case the scoped seed-gone path never reaches because no later turn
 *    touches the dead file);
 *  - a CODE flow whose every resolved seed is a test entrypoint — test entrypoints are never
 *    hydrated (the inventory/orphan passes skip `is_test`), so a persisted test-rooted flow is
 *    invisible-to-the-agent clutter;
 *  - a SKILL flow whose bundle's SKILL.md is gone from disk (bundle deleted — the deletion never
 *    partitions into a skill root, so no scoped pass can see it).
 *
 * A global pass may retire only on trustworthy evidence, so every decision is guarded: an empty
 * call graph skips the whole sweep (it also makes SKILL.md checks meaningless — a wrong or
 * transiently unreadable repo root reads as "everything deleted"); a seed whose file was omitted
 * from the graph, or is present but yields no indexed symbols (a mid-edit syntax error), defers
 * ({@link assess_code_seed_loss}); and every disk check classifies errno — only ENOENT/ENOTDIR
 * count as absent, any other failure (EACCES, a flaky mount) defers rather than retires
 * ({@link path_presence}). A truncated-but-present SKILL.md is 3a's degraded-bundle defer, not
 * staleness. Flows already handled or deferred this turn are skipped, so a same-turn resync,
 * retire, or deferral is never contradicted or duplicated.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { CallGraph, SymbolId } from "@ariadnejs/types";
import { build_symbol_path_index } from "@code-charter/core";

import { is_skill_flow_id, stored_seed_files, stored_seed_paths, stored_skill_root } from "./flow_store";
import type { PersistedFlow } from "./flow_store";
import { to_abs } from "./paths";
import { SKILL_FILE } from "./skill_dir";
import type { DeferredRetirement, FlowOutcome, ReconcileDeps } from "./types";

/** Map a code flow's stored `entry_points` (symbol_paths) back to live `SymbolId`s (the inverse of flow_id_of). */
export function stored_seed_symbol_ids(
  flow: PersistedFlow,
  graph: CallGraph,
  index: Map<string, SymbolId> = build_symbol_path_index(graph),
): SymbolId[] {
  const out: SymbolId[] = [];
  for (const seed_path of stored_seed_paths(flow)) {
    const id = index.get(seed_path);
    if (id !== undefined) out.push(id);
  }
  return out;
}

/** Whether every resolved seed of `flow` is a test entrypoint — the never-hydrated shape. */
export function is_test_rooted(flow: PersistedFlow, graph: CallGraph, index?: Map<string, SymbolId>): boolean {
  const seeds = stored_seed_symbol_ids(flow, graph, index);
  return seeds.length > 0 && seeds.every((seed) => graph.nodes.get(seed)?.is_test === true);
}

/**
 * Errno-classified existence: only ENOENT/ENOTDIR prove absence. Any other stat failure (EACCES, a
 * flaky mount) is indeterminate — evidence to defer on, never to retire on.
 */
export function path_presence(abs_path: string): "present" | "absent" | "indeterminate" {
  try {
    fs.statSync(abs_path);
    return "present";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR" ? "absent" : "indeterminate";
  }
}

export type SeedLossAssessment = { kind: "retire"; reason: string } | { kind: "defer"; reason: string };

/**
 * Judge a code flow none of whose stored seeds resolves: genuine deletion/rename (retire), or an
 * untrustworthy graph (defer and retry naturally on a later turn). When the graph came back empty,
 * the seed's own file was omitted by a read/index failure, or the file is still on disk but yields
 * no indexed symbols at all (a mid-edit syntax error typically parses without throwing and just
 * drops the definitions), retiring would destroy a live flow on bad evidence. A partially broken
 * file that still yields some symbols is indistinguishable from a genuine deletion and retires;
 * the flow re-hydrates under the same id once the file parses again.
 */
export function assess_code_seed_loss(deps: ReconcileDeps, flow: PersistedFlow, graph: CallGraph): SeedLossAssessment {
  if (graph.nodes.size === 0) return { kind: "defer", reason: "empty call graph" };
  const omitted = deps.adapter.omitted_files();
  for (const file of stored_seed_files(flow)) {
    if (omitted.has(file)) {
      return { kind: "defer", reason: `seed file omitted from graph: ${file}` };
    }
    const presence = path_presence(to_abs(file, deps.repo_root_abs));
    if (presence === "indeterminate") {
      return { kind: "defer", reason: `seed file unreadable: ${file}` };
    }
    if (presence === "present" && deps.adapter.anchored_symbols([file]).length === 0) {
      return { kind: "defer", reason: `seed file present but yields no indexed symbols: ${file}` };
    }
  }
  return { kind: "retire", reason: "seed entrypoint gone (deleted or renamed away)" };
}

/** The turn's accumulating record, shared across the dispatch passes and the sweep. */
export interface TurnState {
  outcomes: FlowOutcome[];
  handled: Set<string>;
  retired: Set<string>;
}

/**
 * Sweep the persisted flows for the three stale shapes and retire (soft-delete) what the guards
 * corroborate. Mutates `state` and `deferred_retirements` in place, like the dispatch passes.
 * Iterates in sorted-id order so outcomes are byte-stable; skips flows already handled or deferred
 * this turn. A skill flow predating the `skill_root` attribute cannot be located on disk and is
 * left live with a diagnostic — it becomes sweepable once its bundle is next touched (a resync
 * re-stamps the attribute).
 */
export function sweep_stale_flows(
  deps: ReconcileDeps,
  persisted: readonly PersistedFlow[],
  graph: CallGraph,
  state: TurnState,
  deferred_retirements: DeferredRetirement[],
): void {
  if (graph.nodes.size === 0) {
    if (persisted.some((flow) => !state.handled.has(flow.node.id))) deps.log("stale-flow sweep skipped: empty call graph");
    return;
  }
  const deferred_ids = new Set(deferred_retirements.map((deferred) => deferred.flow_id));
  const index = build_symbol_path_index(graph);
  const retire = (flow: PersistedFlow, kind: "skill" | "code", reason: string): void => {
    deps.store.soft_delete({ kind: "node", id: flow.node.id });
    deps.log(`retired flow ${flow.node.id} (${reason})`);
    state.outcomes.push({ flow_id: flow.node.id, action: "retire", kind, member_count: 0, last_synced_at: null, reason });
    state.handled.add(flow.node.id);
    state.retired.add(flow.node.id);
  };
  const defer = (flow: PersistedFlow, reason: string): void => {
    deferred_retirements.push({ flow_id: flow.node.id, reason });
    deps.log(`deferred retirement of ${flow.node.id}: ${reason}`);
  };

  const candidates = [...persisted].sort((a, b) => (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0));
  let swept = 0;
  for (const flow of candidates) {
    if (state.handled.has(flow.node.id) || deferred_ids.has(flow.node.id)) continue;

    if (is_skill_flow_id(flow.node.id)) {
      const skill_root = stored_skill_root(flow);
      if (skill_root === undefined) {
        deps.log(`stale-flow sweep: skill flow ${flow.node.id} has no skill_root; not sweepable until its bundle is next synced`);
        continue;
      }
      const presence = path_presence(to_abs(path.posix.join(skill_root, SKILL_FILE), deps.repo_root_abs));
      if (presence === "present") continue;
      if (presence === "indeterminate") defer(flow, `skill bundle root unreadable: ${skill_root}`);
      else {
        retire(flow, "skill", `skill bundle deleted (${skill_root}/${SKILL_FILE} gone)`);
        swept += 1;
      }
      continue;
    }

    if (is_test_rooted(flow, graph, index)) {
      retire(flow, "code", "test-rooted flow (test entrypoints are not hydrated)");
      swept += 1;
      continue;
    }
    if (stored_seed_symbol_ids(flow, graph, index).length > 0) continue;
    const assessment = assess_code_seed_loss(deps, flow, graph);
    if (assessment.kind === "defer") defer(flow, assessment.reason);
    else {
      retire(flow, "code", assessment.reason);
      swept += 1;
    }
  }

  if (swept > 0) {
    deps.log(`stale-flow sweep retired ${swept} flow(s)`);
    // A legitimate large deletion and a subtle evidence bug look identical from inside the sweep;
    // when most of the store goes at once, say so loudly rather than let it read as routine.
    if (swept >= 25 && swept * 2 >= persisted.length) {
      deps.log(`stale-flow sweep anomaly: retired ${swept} of ${persisted.length} persisted flow(s) in one turn`);
    }
  }
}
