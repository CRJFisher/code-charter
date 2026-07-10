/**
 * Weakness: deep_chain — a four-stage pipeline whose EVERY hop is a string-keyed registry lookup,
 * so the chain fragments into four singleton flows and the evidence for the tail stages sits
 * several reads away from the head.
 * Expected agent behaviour: follow the chain hop by hop and stitch ALL four stages (plus the
 * registry) into one umbrella, bridged at the `next()` sites — shallow stitching that stops at
 * the first hop leaves the tail fragmented.
 * Consumed by reconcile_stitch_eval.test.ts (Tier 1, structural) and bin/stitch_eval.ts (Tier 2).
 */
// The stage table is wired by the pipeline runner at startup — invisible to static analysis.
const stage_table = new Map<string, () => number>();

export function lookup_step(key: string): () => number {
  return stage_table.get(key)!;
}
