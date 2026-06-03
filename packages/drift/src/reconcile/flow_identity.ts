/**
 * Stable flow identity (AC#9, D-FLOW-IDENTITY). A flow's id is its dominant seed's `symbol_path`, stable
 * across body edits. But a re-detection can move the dominant seed (a rename) or regroup members
 * (split/merge), changing the id and stranding a user's rename/pin. The `anchor_set_hash` (a hash of the
 * sorted member set) plus a ≥50% overlap remap recover the common case: a freshly-detected flow whose id
 * differs from a persisted one but whose members substantially overlap *is* that flow under a new id, so
 * the user-owned content carries across. A weak overlap is a genuine split/merge — the stranded flow is
 * surfaced in the re-attachment bin, never silently dropped.
 */

import { createHash } from "node:crypto";

import type { PersistedFlow } from "./flow_store";

/** Deterministic hash of a flow's sorted member set — the identity anchor stored on the flow node. */
export function anchor_set_hash(member_ids: readonly string[]): string {
  return createHash("sha256").update([...member_ids].sort().join("\n"), "utf8").digest("hex");
}

/** A persisted flow whose membership overlaps a freshly-detected one — the remap candidate. */
export interface FlowMatch {
  flow: PersistedFlow;
  /** Jaccard overlap of the two member sets, 0–1. */
  overlap: number;
}

/** Jaccard overlap of two id sets. */
function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const id of a) if (b.has(id)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export const REMAP_OVERLAP_THRESHOLD = 0.5;

/**
 * The persisted flow that best matches `new_member_ids` by ≥50% member overlap and a *different* id (a
 * same-id flow is a re-sync, handled before this). Ties broken by lower id for determinism. Undefined
 * when nothing clears the threshold (a new flow, or a split/merge).
 */
export function match_existing_flow(
  new_id: string,
  new_member_ids: readonly string[],
  persisted: readonly PersistedFlow[],
): FlowMatch | undefined {
  const target = new Set(new_member_ids);
  let best: FlowMatch | undefined;
  for (const flow of persisted) {
    if (flow.node.id === new_id) continue;
    const stored = flow.node.attributes.anchor_set;
    const members = new Set(Array.isArray(stored) ? (stored as string[]) : flow.member_edges.map((e) => e.dst_id));
    const overlap = jaccard(target, members);
    if (overlap < REMAP_OVERLAP_THRESHOLD) continue;
    if (best === undefined || overlap > best.overlap || (overlap === best.overlap && flow.node.id < best.flow.node.id)) {
      best = { flow, overlap };
    }
  }
  return best;
}
