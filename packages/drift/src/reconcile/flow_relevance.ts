/**
 * Flow-relevance: does an edited file have any chance of belonging to a flow? A file is flow-relevant
 * iff it is a supported source (Ariadne can parse it into the call graph) OR it lives under a `SKILL.md`
 * ancestor (it is part of a skill bundle). This is the same union the reconcile partition encodes when it
 * splits the changed set into code files and skill bundles (`reconcile.ts`) — anything outside it (a
 * standalone `.md`, a `.json`/`.gitignore` config) maps to no flow and the engine drops it.
 *
 * The `Stop` hook uses this to pre-filter the worked-on set BEFORE deciding to block: a turn that edited
 * only non-flow files would otherwise launch a full-repo reconcile that no-ops, spending the user's
 * tokens for nothing. The reconcile partition keeps its own value-bearing form (it needs the skill-root
 * path, not just a boolean), so it is intentionally not collapsed into this predicate.
 */

import { is_supported_source } from "./headless_project";
import { to_abs } from "./paths";
import { find_skill_root } from "./skill_dir";

export function is_flow_relevant(abs_path: string, repo_root_abs: string): boolean {
  const abs = to_abs(abs_path, repo_root_abs);
  return is_supported_source(abs) || find_skill_root(abs, repo_root_abs) !== undefined;
}

/** A worked-on set split into the files that can form a flow and the rest (dropped, never reconciled). */
interface FlowRelevancePartition {
  relevant: string[];
  dropped: string[];
}

/** Partition `worked_on` (absolute paths) into flow-relevant vs. droppable, preserving input order. */
export function filter_flow_relevant(
  worked_on: readonly string[],
  repo_root_abs: string,
): FlowRelevancePartition {
  const relevant: string[] = [];
  const dropped: string[] = [];
  for (const file_path of worked_on) {
    if (is_flow_relevant(file_path, repo_root_abs)) {
      relevant.push(file_path);
    } else {
      dropped.push(file_path);
    }
  }
  return { relevant, dropped };
}
