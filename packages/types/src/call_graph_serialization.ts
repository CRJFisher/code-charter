import type {
  CallGraph,
  CallableNode,
  IndirectReachability,
  SymbolId,
} from "@ariadnejs/types";

/**
 * `CallGraph` contains `Map`s which do not survive `JSON.stringify`. VS Code's
 * `webview.postMessage` serializes via JSON, so Maps would arrive as `{}` on
 * the UI side. We send entries arrays over the wire and rehydrate Maps on
 * receive.
 */
export interface SerializedCallGraph {
  nodes: [SymbolId, CallableNode][];
  entry_points: SymbolId[];
  indirect_reachability?: [SymbolId, IndirectReachability][];
}

export function serialize_call_graph(graph: CallGraph): SerializedCallGraph {
  const serialized: SerializedCallGraph = {
    nodes: Array.from(graph.nodes.entries()),
    entry_points: Array.from(graph.entry_points),
  };
  if (graph.indirect_reachability) {
    serialized.indirect_reachability = Array.from(graph.indirect_reachability.entries());
  }
  return serialized;
}

export function deserialize_call_graph(serialized: SerializedCallGraph): CallGraph {
  return {
    nodes: new Map(serialized.nodes),
    entry_points: serialized.entry_points,
    indirect_reachability: serialized.indirect_reachability
      ? new Map(serialized.indirect_reachability)
      : undefined,
  };
}
