import { CallGraph, Def, CallGraphNode } from "@ariadnejs/core";

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

interface TreeAndContextSummaries {
  functionSummaries: Record<string, string>;
  refinedFunctionSummaries: Record<string, string>;
  callTreeWithFilteredOutNodes: Record<string, CallGraphNode>;
  contextSummary: string;
}

export type { CallGraph, TreeAndContextSummaries };

export { countNodes };
