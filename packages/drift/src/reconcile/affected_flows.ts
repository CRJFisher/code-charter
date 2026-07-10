/**
 * Membership resolution (AC#2): which persisted CODE flows a turn's symbol-level change touches. A flow
 * re-syncs iff its body OR membership drifted this turn, via two symbol-level triggers — so an edit to a
 * shared file that changes a symbol no flow depends on does not re-sync that flow:
 *
 *   (a) BODY drift       — a body-modified symbol lies in the flow's induced membership.
 *                          `reconcile.body_modified_member_ids` maps `delta.modified` symbol_paths to the
 *                          live SymbolIds passed in here.
 *   (b) MEMBERSHIP drift — the flow's freshly induced member set (as `flow_id_of` symbol_paths) differs
 *                          from its persisted `anchor_set`, catching added, removed, and relocated members.
 *
 * A whitespace/comment edit matches neither trigger, so the flow is a no-op (AC#4).
 *
 * A flow with no live code seed never reaches the (a)/(b) triggers (`paths_of(∅)` would otherwise fire (b)
 * spuriously against the stored `anchor_set`); the two zero-seed shapes split on whether the flow
 * enumerates member edges. A skill (doc) flow enumerates its doc members as edges and re-syncs via the
 * touched-skill-root join in `reconcile`, so it is left alone. A seed-gone code flow is surfaced here for
 * retirement only when this turn's changed files implicate its stored seed — this pass is the eager,
 * change-scoped path. Flows an edit never implicates (an out-of-band seed deletion, a deleted skill
 * bundle, legacy test-rooted clutter) are reclaimed by the guarded stale-flow sweep (`stale_flows.ts`),
 * which shares the same trustworthy-evidence assessment, so a degenerate graph still cannot retire a
 * healthy flow.
 */

import type { CallGraph, SymbolId } from "@ariadnejs/types";
import { induce_members, paths_of, reconstruct_flow_membership } from "@code-charter/core";

import { stored_seed_files } from "./flow_store";
import type { PersistedFlow } from "./flow_store";

/**
 * The persisted code flows touched by this turn's change. `body_modified_ids` are the live `SymbolId`s
 * of the body-modified symbols (the body-drift trigger); membership drift is detected per flow against
 * its stored `anchor_set`; `changed_files` (the turn's repo-relative set) scopes seed-gone retirement.
 */
export function affected_persisted_flows(
  body_modified_ids: ReadonlySet<SymbolId>,
  persisted: readonly PersistedFlow[],
  graph: CallGraph,
  changed_files: ReadonlySet<string>,
): PersistedFlow[] {
  return persisted.filter((flow) => {
    const membership = reconstruct_flow_membership(
      { flow_node: flow.node, member_edges: flow.member_edges, bridge_edges: flow.bridge_edges },
      graph,
    );
    // No live code seed: the two zero-seed shapes split on whether the flow enumerates member edges. A
    // skill/doc flow has them (re-synced elsewhere via the skill-root join); a seed-gone code flow has
    // none, and retires only when this turn touches its seed's file. See module header.
    if (membership.seeds.length === 0) {
      if (flow.member_edges.length > 0) return false;
      return stored_seed_files(flow).some((file) => changed_files.has(file));
    }

    const members = induce_members(membership, graph);

    // (a) BODY drift.
    for (const member of members) {
      if (body_modified_ids.has(member)) return true;
    }

    // (b) MEMBERSHIP drift.
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
