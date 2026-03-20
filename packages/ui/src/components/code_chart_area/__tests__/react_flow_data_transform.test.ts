import { generateReactFlowElements } from "../react_flow_data_transform";
import type { CallableNode, SymbolId, SymbolName, FilePath, ScopeId, AnyDefinition, CallReference } from "@ariadnejs/types";
import { TreeAndContextSummaries, NodeGroup } from "@code-charter/types";

describe("generateReactFlowElements", () => {
  function make_id(name: string): SymbolId {
    return `function:/test/${name}.ts:1:0:10:0:${name}` as SymbolId;
  }

  function make_call_ref(target: CallableNode): CallReference {
    return {
      location: target.location,
      name: target.name,
      scope_id: "function:/test:0:0:100:0" as ScopeId,
      call_type: "function" as const,
      resolutions: [{ symbol_id: target.symbol_id, confidence: "certain" as const, reason: { type: "direct" as const } }],
    };
  }

  const createMockNode = (name: string, enclosed_calls: CallReference[] = []): CallableNode => ({
    symbol_id: make_id(name),
    name: name as SymbolName,
    enclosed_calls,
    location: {
      file_path: `/test/${name}.ts` as FilePath,
      start_line: 1,
      start_column: 0,
      end_line: 10,
      end_column: 0,
    },
    definition: {
      kind: "function",
      symbol_id: make_id(name),
      name: name as SymbolName,
      defining_scope_id: "global:/test:0:0:100:0" as ScopeId,
      location: {
        file_path: `/test/${name}.ts` as FilePath,
        start_line: 1,
        start_column: 0,
        end_line: 10,
        end_column: 0,
      },
      is_exported: false,
      signature: { parameters: [] },
      body_scope_id: `function:/test/${name}.ts:1:0:10:0` as ScopeId,
    } as AnyDefinition,
    is_test: false,
  });

  const createMockSummaries = (nodes: CallableNode[]): TreeAndContextSummaries => ({
    callTreeWithFilteredOutNodes: nodes.reduce((acc, node) => {
      acc[node.symbol_id] = node;
      return acc;
    }, {} as Record<string, CallableNode>),
    functionSummaries: nodes.reduce((acc, node) => {
      acc[node.symbol_id] = `Summary for ${node.name}`;
      return acc;
    }, {} as Record<string, string>),
    refinedFunctionSummaries: {},
    contextSummary: "Test context",
  });

  describe("basic functionality", () => {
    it("should generate nodes and edges for a simple call tree", () => {
      const child = createMockNode("child");
      const parent = createMockNode("parent", [make_call_ref(child)]);

      const summaries = createMockSummaries([parent, child]);

      const { nodes, edges } = generateReactFlowElements(parent, summaries, undefined);

      expect(nodes).toHaveLength(2);
      expect(edges).toHaveLength(1);

      expect(nodes[0].id).toBe(parent.symbol_id);
      expect(nodes[0].type).toBe("code_function");
      expect(nodes[0].data.function_name).toBe("parent");
      expect(nodes[0].data.is_entry_point).toBe(true);

      expect(nodes[1].id).toBe(child.symbol_id);
      expect(nodes[1].data.is_entry_point).toBe(false);

      expect(edges[0].source).toBe(parent.symbol_id);
      expect(edges[0].target).toBe(child.symbol_id);
    });

    it("should handle empty call tree", () => {
      const node = createMockNode("single");
      const summaries = createMockSummaries([node]);

      const { nodes, edges } = generateReactFlowElements(node, summaries, undefined);

      expect(nodes).toHaveLength(1);
      expect(edges).toHaveLength(0);
    });

    it("should handle cycles by not duplicating nodes", () => {
      const nodeA = createMockNode("a");
      const nodeB = createMockNode("b");

      // Create cycle: A calls B, B calls A
      const a_with_calls = createMockNode("a", [make_call_ref(nodeB)]);
      const b_with_calls = createMockNode("b", [make_call_ref(nodeA)]);

      const summaries: TreeAndContextSummaries = {
        callTreeWithFilteredOutNodes: {
          [a_with_calls.symbol_id]: a_with_calls,
          [b_with_calls.symbol_id]: b_with_calls,
        },
        functionSummaries: {
          [a_with_calls.symbol_id]: "Summary A",
          [b_with_calls.symbol_id]: "Summary B",
        },
        refinedFunctionSummaries: {},
        contextSummary: "Test context",
      };

      const { nodes, edges } = generateReactFlowElements(a_with_calls, summaries, undefined);

      expect(nodes).toHaveLength(2);
      expect(edges).toHaveLength(2);
    });
  });

  describe("module grouping", () => {
    it("should create module nodes when nodeGroups are provided", () => {
      const node1 = createMockNode("func1");
      const node2 = createMockNode("func2");
      const node3 = createMockNode("func3");

      const parent = createMockNode("func1", [make_call_ref(node2), make_call_ref(node3)]);

      const summaries = createMockSummaries([parent, node2, node3]);

      const nodeGroups: NodeGroup[] = [
        {
          description: "Module 1 functions",
          memberSymbols: [parent.symbol_id, node2.symbol_id],
        },
        {
          description: "Module 2 functions",
          memberSymbols: [node3.symbol_id],
        },
      ];

      const { nodes, edges } = generateReactFlowElements(parent, summaries, nodeGroups);

      // Should have 3 function nodes + 2 module nodes
      expect(nodes).toHaveLength(5);

      const moduleNodes = nodes.filter(n => n.type === "module_group");
      expect(moduleNodes).toHaveLength(2);

      // Function nodes should have parentId set
      const funcNode1 = nodes.find(n => n.id === parent.symbol_id);
      const funcNode2 = nodes.find(n => n.id === node2.symbol_id);
      expect(funcNode1?.parentId).toBe("module_0");
      expect(funcNode2?.parentId).toBe("module_0");

      const funcNode3 = nodes.find(n => n.id === node3.symbol_id);
      expect(funcNode3?.parentId).toBe("module_1");

      // Should have inter-module edge
      const moduleEdges = edges.filter(e => e.id.startsWith("module-edge-"));
      expect(moduleEdges).toHaveLength(1);
      expect(moduleEdges[0].source).toBe("module_0");
      expect(moduleEdges[0].target).toBe("module_1");
    });

    it("should handle empty node groups", () => {
      const node = createMockNode("func");
      const summaries = createMockSummaries([node]);
      const nodeGroups: NodeGroup[] = [];

      const { nodes } = generateReactFlowElements(node, summaries, nodeGroups);

      const moduleNodes = nodes.filter(n => n.type === "module_group");
      expect(moduleNodes).toHaveLength(0);
    });
  });

  describe("data transformation", () => {
    it("should extract function name from node", () => {
      const node = createMockNode("method");
      const summaries = createMockSummaries([node]);

      const { nodes } = generateReactFlowElements(node, summaries, undefined);

      expect(nodes[0].data.function_name).toBe("method");
    });

    it("should include file path and line number in node data", () => {
      const node = createMockNode("func");
      const summaries = createMockSummaries([node]);

      const { nodes } = generateReactFlowElements(node, summaries, undefined);

      expect(nodes[0].data.file_path).toBe("/test/func.ts");
      expect(nodes[0].data.line_number).toBe(1);
    });

    it("should handle missing summaries gracefully", () => {
      const node = createMockNode("func");
      const summaries = createMockSummaries([node]);
      // Remove the summary for this node
      delete summaries.functionSummaries[node.symbol_id];

      const { nodes } = generateReactFlowElements(node, summaries, undefined);

      expect(nodes).toHaveLength(1);
      expect(nodes[0].data.summary).toBe("");
    });
  });
});
