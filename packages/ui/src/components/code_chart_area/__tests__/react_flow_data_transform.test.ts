import { generateReactFlowElements } from "../react_flow_data_transform";
import type { CallableNode, CallReference, AnyDefinition, SymbolId, SymbolName } from "@code-charter/types";
import { DocstringSummaries, NodeGroup } from "@code-charter/types";

describe("generateReactFlowElements", () => {
  function make_symbol(name: string): SymbolId {
    return `function:/test/${name}.ts:1:0:10:0:${name}` as SymbolId;
  }

  function make_location(name: string) {
    return {
      file_path: `/test/${name}.ts`,
      start_line: 1,
      start_column: 0,
      end_line: 10,
      end_column: 0,
    };
  }

  function make_definition(name: string): AnyDefinition {
    return {
      kind: "function" as const,
      symbol_id: make_symbol(name),
      name: name as SymbolName,
      defining_scope_id: "scope:0",
      location: make_location(name),
      is_exported: false,
      signature: { parameters: [] },
      body_scope_id: "scope:1",
    } as AnyDefinition;
  }

  function make_call_reference(target: CallableNode): CallReference {
    return {
      location: target.location,
      name: target.name,
      scope_id: "scope:0",
      call_type: "function",
      resolutions: [{ symbol_id: target.symbol_id }],
    } as CallReference;
  }

  const create_mock_node = (name: string, enclosed_calls: CallReference[] = []): CallableNode => ({
    symbol_id: make_symbol(name),
    name: name as SymbolName,
    enclosed_calls,
    location: make_location(name),
    definition: make_definition(name),
    is_test: false,
  }) as CallableNode;

  const create_mock_descriptions = (nodes: CallableNode[]): DocstringSummaries => ({
    call_tree: nodes.reduce((acc, node) => {
      acc[node.symbol_id as string] = node;
      return acc;
    }, {} as Record<string, CallableNode>),
    docstrings: nodes.reduce((acc, node) => {
      acc[node.symbol_id as string] = `Description for ${(node.definition as any).name}`;
      return acc;
    }, {} as Record<string, string>),
  });

  describe("basic functionality", () => {
    it("should generate nodes and edges for a simple call tree", () => {
      const child = create_mock_node("child");
      const parent = create_mock_node("parent", [make_call_reference(child)]);

      const descriptions = create_mock_descriptions([parent, child]);

      const { nodes, edges } = generateReactFlowElements(parent, descriptions, undefined);

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
      const node = create_mock_node("single");
      const descriptions = create_mock_descriptions([node]);

      const { nodes, edges } = generateReactFlowElements(node, descriptions, undefined);

      expect(nodes).toHaveLength(1);
      expect(edges).toHaveLength(0);
    });

    it("should handle cycles by not duplicating nodes", () => {
      const node_a = create_mock_node("a");
      const node_b = create_mock_node("b");

      // Create a cycle: A calls B, B calls A
      (node_a as any).enclosed_calls = [make_call_reference(node_b)];
      (node_b as any).enclosed_calls = [make_call_reference(node_a)];

      const descriptions: DocstringSummaries = {
        call_tree: {
          [node_a.symbol_id as string]: node_a,
          [node_b.symbol_id as string]: node_b,
        },
        docstrings: {
          [node_a.symbol_id as string]: "Description A",
          [node_b.symbol_id as string]: "Description B",
        },
      };

      const { nodes, edges } = generateReactFlowElements(node_a, descriptions, undefined);

      expect(nodes).toHaveLength(2);
      expect(edges).toHaveLength(2);
    });
  });

  describe("module grouping", () => {
    it("should create module nodes when nodeGroups are provided", () => {
      const node2 = create_mock_node("func2");
      const node3 = create_mock_node("func3");
      const node1 = create_mock_node("func1", [make_call_reference(node2), make_call_reference(node3)]);

      const descriptions = create_mock_descriptions([node1, node2, node3]);

      const nodeGroups: NodeGroup[] = [
        {
          description: "Module 1 functions",
          memberSymbols: [node1.symbol_id as string, node2.symbol_id as string],
        },
        {
          description: "Module 2 functions",
          memberSymbols: [node3.symbol_id as string],
        },
      ];

      const { nodes, edges } = generateReactFlowElements(node1, descriptions, nodeGroups);

      // Should have 3 function nodes + 2 module nodes
      expect(nodes).toHaveLength(5);

      const moduleNodes = nodes.filter(n => n.type === "module_group");
      expect(moduleNodes).toHaveLength(2);

      // Function nodes should have parentId set
      const funcNode1 = nodes.find(n => n.id === (node1.symbol_id as string));
      const funcNode2 = nodes.find(n => n.id === (node2.symbol_id as string));
      expect(funcNode1?.parentId).toBe("module_0");
      expect(funcNode2?.parentId).toBe("module_0");

      const funcNode3 = nodes.find(n => n.id === (node3.symbol_id as string));
      expect(funcNode3?.parentId).toBe("module_1");

      // Should have inter-module edge
      const moduleEdges = edges.filter(e => e.id.startsWith("module-edge-"));
      expect(moduleEdges).toHaveLength(1);
      expect(moduleEdges[0].source).toBe("module_0");
      expect(moduleEdges[0].target).toBe("module_1");
    });

    it("should handle empty node groups", () => {
      const node = create_mock_node("func");
      const descriptions = create_mock_descriptions([node]);
      const nodeGroups: NodeGroup[] = [];

      const { nodes } = generateReactFlowElements(node, descriptions, nodeGroups);

      const moduleNodes = nodes.filter(n => n.type === "module_group");
      expect(moduleNodes).toHaveLength(0);
    });
  });

  describe("data transformation", () => {
    it("should extract function name from symbol", () => {
      const node = create_mock_node("method");
      const descriptions = create_mock_descriptions([node]);

      const { nodes } = generateReactFlowElements(node, descriptions, undefined);

      expect(nodes[0].data.function_name).toBe("method");
    });

    it("should include file path and line number in node data", () => {
      const node = create_mock_node("func");
      const descriptions = create_mock_descriptions([node]);

      const { nodes } = generateReactFlowElements(node, descriptions, undefined);

      expect(nodes[0].data.file_path).toBe("/test/func.ts");
      expect(nodes[0].data.line_number).toBe(1);
    });

    it("should handle missing descriptions gracefully", () => {
      const node = create_mock_node("func");
      const descriptions = create_mock_descriptions([node]);
      // Remove the description for this node
      delete descriptions.docstrings[node.symbol_id as string];

      const { nodes } = generateReactFlowElements(node, descriptions, undefined);

      expect(nodes).toHaveLength(1);
      expect(nodes[0].data.description).toBe("");
    });
  });
});
