/**
 * Membership resolution (AC#5): which persisted flows a changed-file set touches. A flow is affected
 * when its *re-induced* subgraph (seeds + bridges + linked docs — never a stored enumerated leaf set,
 * never an `agentic.contains` tree-walk) contains a member defined in a changed file. A leaf shared by
 * several flows affects all of them, because each flow is induced independently.
 */

import type { CallGraph, SymbolId } from "@ariadnejs/types";
import { induce_members, reconstruct_flow_membership } from "@code-charter/core";

import type { AriadneAdapter } from "./ariadne_adapter";
import type { PersistedFlow } from "./flow_store";

/**
 * The persisted flows touched by `changed_files` (repo-relative). For each flow, re-induce its members
 * and test whether any is defined in a changed file — a code member via the call graph's location, a doc
 * member via its node path.
 */
export function affected_persisted_flows(
  changed_files: ReadonlySet<string>,
  persisted: readonly PersistedFlow[],
  graph: CallGraph,
  adapter: AriadneAdapter,
  node_path: (id: string) => string | undefined,
): PersistedFlow[] {
  return persisted.filter((flow) => {
    const membership = reconstruct_flow_membership(
      { flow_node: flow.node, member_edges: flow.member_edges, bridge_edges: flow.bridge_edges },
      graph,
    );
    for (const member of induce_members(membership, graph)) {
      const file = graph.nodes.has(member as SymbolId)
        ? adapter.file_of(member as SymbolId)
        : node_path(member);
      if (file !== undefined && changed_files.has(file)) return true;
    }
    return false;
  });
}
