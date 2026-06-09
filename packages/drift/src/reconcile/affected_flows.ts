/**
 * Membership resolution (AC#2): which persisted CODE flows a turn's symbol-level change touches.
 * Replaces the changed-FILE intersection with two symbol-level triggers, so an edit to a shared file
 * that changes a symbol no flow depends on no longer re-syncs that flow:
 *
 *   (a) BODY drift       — a `modified` symbol (a member whose body changed) lies in the flow's induced
 *                          membership. `reconcile.body_modified_member_ids` maps `delta.modified`
 *                          symbol_paths to the live SymbolIds passed in here.
 *   (b) MEMBERSHIP drift — the flow's freshly induced member set (as `flow_id_of` symbol_paths) differs
 *                          from its persisted `anchor_set`. This is what catches added, removed, and
 *                          relocated members — each reshapes the member-path set.
 *
 * Together: re-sync iff the flow's body OR membership drifted this turn. A whitespace/comment edit that
 * changes no member body and no membership matches neither trigger → the flow is a no-op (AC#4).
 *
 * A flow with no live code seed never reaches the (a)/(b) triggers (`paths_of(∅)` ≠ the stored
 * `anchor_set` would otherwise fire (b) spuriously); the two zero-seed shapes are split by whether the
 * flow enumerates member edges. A skill (doc) flow enumerates its doc members as edges and is re-synced
 * via the touched-skill-root join in `reconcile`, so it is left alone. A seed-gone code flow has no
 * member edges (code members are induced from the seeds) and is superseded — it is surfaced so
 * `resync_persisted_flow` retires it (soft-delete), a renamed seed re-hydrating as a fresh flow.
 */

import type { CallGraph, SymbolId } from "@ariadnejs/types";
import { induce_members, paths_of, reconstruct_flow_membership } from "@code-charter/core";

import type { PersistedFlow } from "./flow_store";

/**
 * The persisted code flows touched by this turn's change. `body_modified_ids` are the live `SymbolId`s
 * of the body-modified symbols (the body-drift trigger); membership drift is detected per flow against
 * its stored `anchor_set`.
 */
export function affected_persisted_flows(
  body_modified_ids: ReadonlySet<SymbolId>,
  persisted: readonly PersistedFlow[],
  graph: CallGraph,
): PersistedFlow[] {
  return persisted.filter((flow) => {
    const membership = reconstruct_flow_membership(
      { flow_node: flow.node, member_edges: flow.member_edges, bridge_edges: flow.bridge_edges },
      graph,
    );
    // No live code seed: split the two zero-seed shapes. A skill/doc flow enumerates its members as
    // edges and is re-synced via the touched-skill-root join in `reconcile`, so leave it alone. A
    // seed-gone CODE flow has no member edges (code members are induced from the seeds, never
    // enumerated) and is superseded — surface it so `resync_persisted_flow` retires it (soft-delete).
    if (membership.seeds.length === 0) {
      const is_seed_gone_code_flow = flow.member_edges.length === 0;
      return is_seed_gone_code_flow;
    }

    const members = induce_members(membership, graph);

    // (a) BODY drift: a body-modified symbol is a current member of this flow.
    for (const member of members) {
      if (body_modified_ids.has(member)) return true;
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
