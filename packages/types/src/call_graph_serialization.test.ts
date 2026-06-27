import type {
  CallGraph,
  CallableNode,
  FilePath,
  IndirectReachability,
  SymbolId,
  SymbolName,
} from "@ariadnejs/types";
import type { ScopeId } from "@ariadnejs/types/dist/scopes";
import type { FunctionDefinition } from "@ariadnejs/types/dist/symbol_definitions";

import { deserialize_call_graph, serialize_call_graph } from "./call_graph_serialization";

function make_node(id: string): CallableNode {
  const location = {
    file_path: `${id}.ts` as FilePath,
    start_line: 1,
    start_column: 0,
    end_line: 2,
    end_column: 0,
  };
  const definition: FunctionDefinition = {
    kind: "function",
    symbol_id: id as SymbolId,
    name: id as SymbolName,
    defining_scope_id: "scope:0" as ScopeId,
    location,
    is_exported: false,
    signature: { parameters: [] },
    body_scope_id: "scope:1" as ScopeId,
  };
  return {
    symbol_id: id as SymbolId,
    name: id as SymbolName,
    enclosed_calls: [],
    location,
    definition,
    is_test: false,
  };
}

function make_reachability(id: string): IndirectReachability {
  return {
    function_id: id as SymbolId,
    reason: {
      type: "function_reference",
      read_location: {
        file_path: `${id}.ts` as FilePath,
        start_line: 3,
        start_column: 0,
        end_line: 3,
        end_column: 5,
      },
    },
  };
}

describe("serialize_call_graph", () => {
  it("converts the nodes Map into an entries array", () => {
    const graph: CallGraph = {
      nodes: new Map([["a" as SymbolId, make_node("a")]]),
      entry_points: ["a" as SymbolId],
    };

    const serialized = serialize_call_graph(graph);

    expect(Array.isArray(serialized.nodes)).toBe(true);
    expect(serialized.nodes).toHaveLength(1);
    expect(serialized.nodes[0][0]).toBe("a");
    expect(serialized.nodes[0][1].name).toBe("a");
  });

  it("copies entry_points into a plain array", () => {
    const entry_points = ["a" as SymbolId, "b" as SymbolId];
    const graph: CallGraph = { nodes: new Map(), entry_points };

    const serialized = serialize_call_graph(graph);

    expect(serialized.entry_points).toEqual(["a", "b"]);
    expect(serialized.entry_points).not.toBe(entry_points);
  });

  it("omits indirect_reachability when the graph has none", () => {
    const graph: CallGraph = { nodes: new Map(), entry_points: [] };

    const serialized = serialize_call_graph(graph);

    expect("indirect_reachability" in serialized).toBe(false);
  });

  it("serializes indirect_reachability as an entries array when present", () => {
    const graph: CallGraph = {
      nodes: new Map(),
      entry_points: [],
      indirect_reachability: new Map([["a" as SymbolId, make_reachability("a")]]),
    };

    const serialized = serialize_call_graph(graph);

    expect(serialized.indirect_reachability).toEqual([["a", make_reachability("a")]]);
  });

  it("serializes an empty graph to empty arrays", () => {
    const serialized = serialize_call_graph({ nodes: new Map(), entry_points: [] });

    expect(serialized.nodes).toEqual([]);
    expect(serialized.entry_points).toEqual([]);
  });
});

describe("deserialize_call_graph", () => {
  it("rebuilds the nodes Map from the entries array", () => {
    const node = make_node("a");

    const graph = deserialize_call_graph({
      nodes: [["a" as SymbolId, node]],
      entry_points: ["a" as SymbolId],
    });

    expect(graph.nodes).toBeInstanceOf(Map);
    expect(graph.nodes.get("a" as SymbolId)).toBe(node);
  });

  it("sets indirect_reachability to undefined when absent", () => {
    const graph = deserialize_call_graph({ nodes: [], entry_points: [] });

    expect(graph.indirect_reachability).toBeUndefined();
  });

  it("rebuilds the indirect_reachability Map when present", () => {
    const reachability = make_reachability("a");

    const graph = deserialize_call_graph({
      nodes: [],
      entry_points: [],
      indirect_reachability: [["a" as SymbolId, reachability]],
    });

    expect(graph.indirect_reachability).toBeInstanceOf(Map);
    expect(graph.indirect_reachability?.get("a" as SymbolId)).toBe(reachability);
  });
});

describe("call graph round-trip", () => {
  it("preserves node lookup, entry points, and indirect reachability", () => {
    const graph: CallGraph = {
      nodes: new Map([
        ["a" as SymbolId, make_node("a")],
        ["b" as SymbolId, make_node("b")],
      ]),
      entry_points: ["a" as SymbolId],
      indirect_reachability: new Map([["b" as SymbolId, make_reachability("b")]]),
    };

    const restored = deserialize_call_graph(serialize_call_graph(graph));

    expect(restored.nodes.get("a" as SymbolId)?.name).toBe("a");
    expect(restored.nodes.get("b" as SymbolId)?.name).toBe("b");
    expect(restored.entry_points).toEqual(["a"]);
    expect(restored.indirect_reachability?.get("b" as SymbolId)?.function_id).toBe("b");
  });

  it("survives a JSON.stringify/parse trip the way postMessage transports it", () => {
    const graph: CallGraph = {
      nodes: new Map([["a" as SymbolId, make_node("a")]]),
      entry_points: ["a" as SymbolId],
      indirect_reachability: new Map([["a" as SymbolId, make_reachability("a")]]),
    };

    const wire = JSON.parse(JSON.stringify(serialize_call_graph(graph)));
    const restored = deserialize_call_graph(wire);

    expect(restored.nodes.get("a" as SymbolId)?.name).toBe("a");
    expect(restored.indirect_reachability?.get("a" as SymbolId)?.function_id).toBe("a");
  });
});
