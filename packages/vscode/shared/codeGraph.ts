import { CallGraph, Def, CallGraphNode } from "@ariadnejs/core";
import { TreeAndContextSummaries } from "@code-charter/types";

function countNodes(topLevelNode: string, graph: CallGraph, visitedNodes: Set<string> = new Set<string>()): number {
  const node = graph.nodes.get(topLevelNode);
  if (!node) return 0;

  return node.calls.reduce((acc, call) => {
    if (visitedNodes.has(call.symbol)) {
      return acc;
    }
    visitedNodes.add(call.symbol);
    return acc + countNodes(call.symbol, graph, visitedNodes);
  }, 1);
}

export type { CallGraph, TreeAndContextSummaries };

export { countNodes };
