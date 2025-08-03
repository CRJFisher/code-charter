import { generateReactFlowElements } from "../react_flow_data_transform";
import { CallGraphNode } from "@ariadnejs/core";
import { TreeAndContextSummaries, NodeGroup } from "@code-charter/types";

describe("generateReactFlowElements", () => {
  const createMockNode = (symbol: string, calls: CallGraphNode[] = []): CallGraphNode => ({
    symbol,
    definition: {
      kind: "definition",
      name: symbol.split("::")[1] || symbol,
      symbol_kind: "Function",
      symbol_id: symbol,
      id: 1,
      file_path: `/test/${symbol}.ts`,
      range: {
        start: { row: 1, column: 0 },
        end: { row: 10, column: 0 },
      },
    },
    calls,
    children: [],
  });

  const createMockSummaries = (symbols: string[]): TreeAndContextSummaries => ({
    callTreeWithFilteredOutNodes: symbols.reduce((acc, symbol) => {
      acc[symbol] = createMockNode(symbol);
      return acc;
    }, {} as Record<string, CallGraphNode>),
    functionSummaries: symbols.reduce((acc, symbol) => {
      acc[symbol] = `Summary for ${symbol}`;
      return acc;
    }, {} as Record<string, string>),
    refinedFunctionSummaries: {},
    contextSummary: "Test context",
  });

  describe("basic functionality", () => {
    it("should generate nodes and edges for a simple call tree", () => {
      const child = createMockNode("test::child");
      const parent = createMockNode("test::parent", [child]);
      
      const summaries = createMockSummaries(["test::parent", "test::child"]);
      summaries.callTreeWithFilteredOutNodes["test::parent"].calls = [child];

      const { nodes, edges } = generateReactFlowElements(parent, summaries);

      expect(nodes).toHaveLength(2);
      expect(edges).toHaveLength(1);
      
      expect(nodes[0].id).toBe("test::parent");
      expect(nodes[0].type).toBe("code_function");
      expect(nodes[0].data.function_name).toBe("parent");
      expect(nodes[0].data.is_entry_point).toBe(true);
      
      expect(nodes[1].id).toBe("test::child");
      expect(nodes[1].data.is_entry_point).toBe(false);
      
      expect(edges[0].source).toBe("test::parent");
      expect(edges[0].target).toBe("test::child");
    });

    it("should handle empty call tree", () => {
      const node = createMockNode("test::single");
      const summaries = createMockSummaries(["test::single"]);

      const { nodes, edges } = generateReactFlowElements(node, summaries);

      expect(nodes).toHaveLength(1);
      expect(edges).toHaveLength(0);
    });

    it("should handle cycles by not duplicating nodes", () => {
      const nodeA = createMockNode("test::a");
      const nodeB = createMockNode("test::b");
      
      // Create a cycle: A calls B, B calls A
      nodeA.calls = [nodeB];
      nodeB.calls = [nodeA];
      
      const summaries = createMockSummaries(["test::a", "test::b"]);
      summaries.callTreeWithFilteredOutNodes["test::a"].calls = [nodeB];
      summaries.callTreeWithFilteredOutNodes["test::b"].calls = [nodeA];

      const { nodes, edges } = generateReactFlowElements(nodeA, summaries);

      expect(nodes).toHaveLength(2);
      expect(edges).toHaveLength(2);
    });
  });

  describe("module grouping", () => {
    it("should create module nodes when nodeGroups are provided", () => {
      const node1 = createMockNode("module1::func1");
      const node2 = createMockNode("module1::func2");
      const node3 = createMockNode("module2::func3");
      
      node1.calls = [node2, node3];
      
      const summaries = createMockSummaries(["module1::func1", "module1::func2", "module2::func3"]);
      summaries.callTreeWithFilteredOutNodes["module1::func1"].calls = [node2, node3];
      
      const nodeGroups: NodeGroup[] = [
        {
          description: "Module 1 functions",
          memberSymbols: ["module1::func1", "module1::func2"],
        },
        {
          description: "Module 2 functions", 
          memberSymbols: ["module2::func3"],
        },
      ];

      const { nodes, edges } = generateReactFlowElements(node1, summaries, nodeGroups);

      // Should have 3 function nodes + 2 module nodes
      expect(nodes).toHaveLength(5);
      
      const moduleNodes = nodes.filter(n => n.type === "module_group");
      expect(moduleNodes).toHaveLength(2);
      
      // Function nodes should have parentId set
      const funcNode1 = nodes.find(n => n.id === "module1::func1");
      const funcNode2 = nodes.find(n => n.id === "module1::func2");
      expect(funcNode1?.parentId).toBe("module_0");
      expect(funcNode2?.parentId).toBe("module_0");
      
      const funcNode3 = nodes.find(n => n.id === "module2::func3");
      expect(funcNode3?.parentId).toBe("module_1");
      
      // Should have inter-module edge
      const moduleEdges = edges.filter(e => e.id.startsWith("module-edge-"));
      expect(moduleEdges).toHaveLength(1);
      expect(moduleEdges[0].source).toBe("module_0");
      expect(moduleEdges[0].target).toBe("module_1");
    });

    it("should handle empty node groups", () => {
      const node = createMockNode("test::func");
      const summaries = createMockSummaries(["test::func"]);
      const nodeGroups: NodeGroup[] = [];

      const { nodes } = generateReactFlowElements(node, summaries, nodeGroups);

      const moduleNodes = nodes.filter(n => n.type === "module_group");
      expect(moduleNodes).toHaveLength(0);
    });
  });

  describe("data transformation", () => {
    it("should extract function name from symbol", () => {
      const node = createMockNode("namespace::class::method");
      const summaries = createMockSummaries(["namespace::class::method"]);

      const { nodes } = generateReactFlowElements(node, summaries);

      expect(nodes[0].data.function_name).toBe("method");
    });

    it("should include file path and line number in node data", () => {
      const node = createMockNode("test::func");
      const summaries = createMockSummaries(["test::func"]);

      const { nodes } = generateReactFlowElements(node, summaries);

      expect(nodes[0].data.file_path).toBe("/test/test::func.ts");
      expect(nodes[0].data.line_number).toBe(1);
    });

    it("should handle missing summaries gracefully", () => {
      const node = createMockNode("test::func");
      const summaries = createMockSummaries(["test::func"]);
      // Remove the summary for this node
      delete summaries.functionSummaries["test::func"];

      const { nodes } = generateReactFlowElements(node, summaries);

      expect(nodes).toHaveLength(1);
      expect(nodes[0].data.summary).toBe("");
    });
  });
});