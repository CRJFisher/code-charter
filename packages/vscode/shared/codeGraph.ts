import type { CallGraph, CallableNode, SymbolId } from "@ariadnejs/types";
import type { TreeAndContextSummaries } from "@code-charter/types";
import { get_resolved_symbol_id } from "../src/ariadne/call_graph_utils";

function count_nodes(
  top_level_node: SymbolId,
  graph: CallGraph,
  visited_nodes: Set<SymbolId> = new Set<SymbolId>()
): number {
  const node = graph.nodes.get(top_level_node);
  if (!node) return 0;

  return node.enclosed_calls.reduce((acc, call_ref) => {
    const resolved_id = get_resolved_symbol_id(call_ref);
    if (!resolved_id || visited_nodes.has(resolved_id)) {
      return acc;
    }
    visited_nodes.add(resolved_id);
    return acc + count_nodes(resolved_id, graph, visited_nodes);
  }, 1);
}

export type { CallGraph, CallableNode, TreeAndContextSummaries };

export { count_nodes };
