/**
 * task-27.1.6.6 — agentic entrypoint-stitch detector.
 *
 * Ariadne is a syntactic call-graph extractor: dynamic dispatch, registry lookups, and callback
 * wiring frequently fail to resolve. Each unresolved callee is promoted to its own top-level
 * entrypoint, fragmenting one functionality into several flows. This module repairs those gaps.
 *
 * The seam: {@link EntrypointStitchExecutor} (injected on `ReconcileDeps.stitch_entrypoints`, mirroring
 * `describe`). Its default is {@link null_stitch_executor} — no model call, one-entrypoint-per-flow,
 * byte-identical to the v0 deterministic path. The drift-reconciler sub-agent fills the real executor.
 *
 * The substrate: {@link build_candidate_stitches} runs `detect_gaps` over the changed neighbourhood and
 * pairs each orphan entrypoint that has unresolved shapes in its tree with every other neighbourhood
 * orphan. The agent judges each pair and returns confirmed stitches; the reconcile engine assembles them
 * into multi-seed `CodeUmbrella`s.
 */

import type { CallGraph, SymbolId } from "@ariadnejs/types";
import type { EdgeRow } from "@code-charter/types";

import { DEFAULT_GAP_OPTIONS, detect_gaps, derive_candidate_seeds } from "./gap_detection";
import type { CandidateSeed, GapDetectionOptions, UnresolvedShape } from "./gap_detection";
import { reachable_from } from "../model/flow";

/** v1's single detection goal. Open union so a later goal is an added value. */
export type DetectionGoal = "orient-in-code-tree" | (string & {});

export const STITCH_EXTRACTOR_ID = "agentic.stitch";
export const STITCH_EXTRACTOR_VERSION = "1";

/** Maximum candidate stitch pairs per turn. Overflow falls back to singleton flows (AC#8). */
export const MAX_STITCH_CANDIDATES = 50;

/**
 * One (source, target) stitch proposal: the source orphan has unresolved shapes in its tree that
 * might actually target the target orphan. The agent judges whether the unresolved calls are a real
 * edge.
 */
export interface StitchCandidate {
  /** All unresolved shapes in source_seed's reachable tree — the evidence for the stitch proposal. */
  unresolved_shapes_in_source: readonly UnresolvedShape[];
  /** The orphan entrypoint whose tree has the unresolved calls. */
  source_seed: CandidateSeed;
  /** The orphan entrypoint that the unresolved calls might actually target. */
  target_seed: CandidateSeed;
}

/**
 * An agent-confirmed stitch: merge source and target seeds into one multi-seed umbrella and write
 * an `agentic.bridge` from the unresolved call site's enclosing node to the target entrypoint.
 */
export interface ConfirmedStitch {
  label: string;
  inference_rationale: string;
  /** Combined seeds (source_seed.seeds ∪ target_seed.seeds). */
  merged_seeds: readonly SymbolId[];
  bridge: {
    /** The unresolved shape node — `src_id` for `build_bridge_edges`. */
    src_symbol_id: SymbolId;
    /** The target entrypoint's primary seed — `dst_id` for `build_bridge_edges`. */
    dst_symbol_id: SymbolId;
    /** File path of the unresolved shape, for bridge provenance. */
    source_file: string;
    /** Location of the unresolved shape (e.g. `"L{start_line}"`), for bridge provenance click-through. */
    source_range: string;
  };
}

/**
 * The injected executor seam. Receives candidate stitches, judges each, and returns confirmed stitches.
 * Unconfirmed candidates fall back to singleton flows — no gap in coverage. The default in-process
 * implementation is {@link null_stitch_executor}; the drift-reconciler sub-agent supplies the real one.
 */
export type EntrypointStitchExecutor = (
  candidates: readonly StitchCandidate[],
  goal: DetectionGoal,
) => Promise<readonly ConfirmedStitch[]>;

/** Deterministic no-stitch default: confirms nothing, preserving today's one-entrypoint-per-flow. */
export const null_stitch_executor: EntrypointStitchExecutor = async () => [];

/** Result of {@link build_candidate_stitches}. */
export interface StitchBatch {
  /** Proposed (source, target) pairs for the executor to judge (capped at MAX_STITCH_CANDIDATES). */
  candidates: readonly StitchCandidate[];
  /** All orphan seeds in the neighbourhood (including those not in any candidate pair). */
  neighbourhood_seeds: readonly CandidateSeed[];
  /**
   * Total pairs before the cap. When > candidates.length, truncation occurred; the caller should log
   * the delta so the cap is never silent (AC#8).
   */
  total_pairs: number;
}

/**
 * Build candidate stitches over the changed neighbourhood (AC#1 / AC#2). For each orphan entrypoint
 * in `neighbourhood_files` that has at least one unresolved shape in its reachable tree, pairs it with
 * every other neighbourhood orphan as a (source, target) candidate. Capped at MAX_STITCH_CANDIDATES;
 * overflow pairs omit their target from the candidates list but the seeds remain in
 * `neighbourhood_seeds` (they fall back to singleton flows).
 */
export function build_candidate_stitches(
  neighbourhood_files: ReadonlySet<string>,
  graph: CallGraph,
  doc_edges: readonly EdgeRow[],
  options?: GapDetectionOptions,
): StitchBatch {
  const opts = { ...DEFAULT_GAP_OPTIONS, ...options };
  const gap_report = detect_gaps(graph, doc_edges, opts);

  const neighbourhood_orphans = gap_report.orphan_entrypoints.filter(
    (orphan) => neighbourhood_files.has(orphan.location.file_path),
  );

  const neighbourhood_seed_ids = new Set(neighbourhood_orphans.map((o) => o.flow_id));
  const neighbourhood_seeds = derive_candidate_seeds(gap_report, graph).filter(
    (seed) => seed.origin === "orphan_entrypoint" && neighbourhood_seed_ids.has(seed.id),
  );

  if (neighbourhood_seeds.length < 2) {
    return { candidates: [], neighbourhood_seeds, total_pairs: 0 };
  }

  const seed_by_flow_id = new Map(neighbourhood_seeds.map((s) => [s.id, s]));

  const reachable_by_flow_id = new Map<string, Set<SymbolId>>();
  for (const orphan of neighbourhood_orphans) {
    reachable_by_flow_id.set(orphan.flow_id, reachable_from(orphan.symbol_id, graph));
  }

  let total_pairs = 0;
  const candidates: StitchCandidate[] = [];

  for (const source_orphan of neighbourhood_orphans) {
    const source_seed = seed_by_flow_id.get(source_orphan.flow_id);
    if (!source_seed) continue;
    const reachable = reachable_by_flow_id.get(source_orphan.flow_id)!;

    const unresolved_in_tree = gap_report.unresolved_shapes.filter(
      (shape) => shape.symbol_id === source_orphan.symbol_id || reachable.has(shape.symbol_id),
    );
    if (unresolved_in_tree.length === 0) continue;

    for (const target_seed of neighbourhood_seeds) {
      if (target_seed.id === source_seed.id) continue;
      total_pairs += 1;
      if (candidates.length < MAX_STITCH_CANDIDATES) {
        candidates.push({ unresolved_shapes_in_source: unresolved_in_tree, source_seed, target_seed });
      }
    }
  }

  return { candidates, neighbourhood_seeds, total_pairs };
}
