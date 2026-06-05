/**
 * Membership resolution (AC#2): which persisted CODE flows a turn's symbol-level change touches.
 * Replaces the changed-FILE intersection with two symbol-level triggers, so an edit to a shared file
 * that changes a symbol no flow depends on no longer re-syncs that flow:
 *
 *   (a) BODY drift       — a `modified` symbol (a member whose body changed) lies in the flow's induced
 *                          membership. The caller maps `delta.modified` symbol_paths to live SymbolIds.
 *   (b) MEMBERSHIP drift — the flow's freshly induced member set (as `flow_id_of` symbol_paths) differs
 *                          from its persisted `anchor_set`. This is what catches added, removed, and
 *                          relocated members — each reshapes the member-path set.
 *
 * Together: re-sync iff the flow's body OR membership drifted this turn. A whitespace/comment edit that
 * changes no member body and no membership matches neither trigger → the flow is a no-op (AC#4).
 *
 * A flow with no live code seed is not a re-sync candidate here. This covers two cases uniformly: a skill
 * (doc) flow — its members are doc ids outside the call graph, re-synced via the touched-skill-root join
 * in `reconcile`; and a seed-gone code flow — whose lifecycle (a rename carries its content across via the
 * ≥50% overlap remap in the hydrate step, a deletion is left to that same path) is owned downstream, not
 * force-stranded here. Without this guard, `paths_of(∅)` ≠ the stored `anchor_set` would fire (b) on both
 * and pull them in spuriously.
 */

import type { CallGraph, SymbolId } from "@ariadnejs/types";
import { induce_members, paths_of, reconstruct_flow_membership } from "@code-charter/core";

import type { PersistedFlow } from "./flow_store";

/**
 * The persisted code flows touched by this turn's change. `changed_member_ids` are the live `SymbolId`s
 * of the body-modified symbols (the body-drift trigger); membership drift is detected per flow against
 * its stored `anchor_set`.
 */
export function affected_persisted_flows(
  changed_member_ids: ReadonlySet<SymbolId>,
  persisted: readonly PersistedFlow[],
  graph: CallGraph,
): PersistedFlow[] {
  return persisted.filter((flow) => {
    const membership = reconstruct_flow_membership(
      { flow_node: flow.node, member_edges: flow.member_edges, bridge_edges: flow.bridge_edges },
      graph,
    );
    // No live code seed → not a re-sync candidate here (skill/doc flow, or seed-gone code flow).
    if (membership.seeds.length === 0) return false;

    const members = induce_members(membership, graph);

    // (a) BODY drift: a body-modified symbol is a current member of this flow.
    for (const member of members) {
      if (changed_member_ids.has(member)) return true;
    }

    // (b) MEMBERSHIP drift: the induced member-path set no longer matches the persisted anchor_set.
    const stored = flow.node.attributes.anchor_set;
    if (!Array.isArray(stored)) return true; // no stored anchor_set → re-sync once and self-heal
    return !same_paths(paths_of(members, graph), stored as string[]);
  });
}

/** Equality of two symbol_path lists. `paths_of` returns sorted; `b` (the stored anchor_set) is sorted defensively. */
function same_paths(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted_b = [...b].sort();
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== sorted_b[i]) return false;
  }
  return true;
}
