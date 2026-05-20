import { generateReactFlowElements } from "./call_tree_to_graph";
import type { CallableNode, CallReference, SymbolId, SymbolName } from "@code-charter/types";
import { DocstringSummaries, NodeGroup } from "@code-charter/types";
import type { FilePath, Location } from "@ariadnejs/types";
import type { ScopeId } from "@ariadnejs/types/dist/scopes";
import type { FunctionDefinition } from "@ariadnejs/types/dist/symbol_definitions";
import type { Resolution } from "@ariadnejs/types/dist/symbol_references";

describe("generateReactFlowElements", () => {
  function make_symbol(name: string): SymbolId {
    return `function:/test/${name}.ts:1:0:10:0:${name}` as SymbolId;
  }

  function make_location(name: string): Location {
    return {
      file_path: `/test/${name}.ts` as FilePath,
      start_line: 1,
      start_column: 0,
      end_line: 10,
      end_column: 0,
    };
  }

  function make_definition(name: string): FunctionDefinition {
    return {
      kind: "function",
      symbol_id: make_symbol(name),
      name: name as SymbolName,
      defining_scope_id: "scope:0" as ScopeId,
      location: make_location(name),
      is_exported: false,
      signature: { parameters: [] },
      body_scope_id: "scope:1" as ScopeId,
    };
  }

  function make_call_reference_to(target_symbol_id: SymbolId, target_name: SymbolName, target_location: Location): CallReference {
    const resolution: Resolution = {
      symbol_id: target_symbol_id,
      confidence: "certain",
      reason: { type: "direct" },
    };
    return {
      location: target_location,
      name: target_name,
      scope_id: "scope:0" as ScopeId,
      call_type: "function",
      resolutions: [resolution],
    };
  }

  function make_call_reference(target: CallableNode): CallReference {
    return make_call_reference_to(target.symbol_id, target.name, target.location);
  }

  function create_mock_node(name: string, enclosed_calls: readonly CallReference[] = []): CallableNode {
    return {
      symbol_id: make_symbol(name),
      name: name as SymbolName,
      enclosed_calls,
      location: make_location(name),
      definition: make_definition(name),
      is_test: false,
    };
  }

  function create_mock_descriptions(nodes: CallableNode[]): DocstringSummaries {
    return {
      call_tree: nodes.reduce((acc, node) => {
        acc[node.symbol_id] = node;
        return acc;
      }, {} as Record<string, CallableNode>),
      docstrings: nodes.reduce((acc, node) => {
        acc[node.symbol_id] = `Description for ${node.name}`;
        return acc;
      }, {} as Record<string, string>),
    };
  }

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

    it("should skip edges to calls whose target is not in the call tree", () => {
      // Mirrors the real bug: a higher-order call resolves to a
      // `parameter:` symbol that has no entry in the call_tree.
      const orphan_target = "parameter:/repo/foo.py:10:0:10:5:cb" as SymbolId;
      const orphan_location: Location = {
        file_path: "/repo/foo.py" as FilePath,
        start_line: 10,
        start_column: 0,
        end_line: 10,
        end_column: 5,
      };
      const parent = create_mock_node("parent", [
        make_call_reference_to(orphan_target, "cb" as SymbolName, orphan_location),
      ]);

      const descriptions = create_mock_descriptions([parent]);

      const { nodes, edges } = generateReactFlowElements(parent, descriptions, undefined);

      expect(nodes).toHaveLength(1);
      expect(edges).toHaveLength(0);
    });

    it("should handle cycles by not duplicating nodes", () => {
      // Build a cycle (A↔B) without mutating readonly fields: each node's
      // enclosed_calls array is captured by reference, then populated with
      // call references to the other node once both nodes exist.
      const a_calls: CallReference[] = [];
      const b_calls: CallReference[] = [];
      const node_a = create_mock_node("a", a_calls);
      const node_b = create_mock_node("b", b_calls);
      a_calls.push(make_call_reference(node_b));
      b_calls.push(make_call_reference(node_a));

      const descriptions: DocstringSummaries = {
        call_tree: {
          [node_a.symbol_id]: node_a,
          [node_b.symbol_id]: node_b,
        },
        docstrings: {
          [node_a.symbol_id]: "Description A",
          [node_b.symbol_id]: "Description B",
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

      const node_groups: NodeGroup[] = [
        {
          description: "Module 1 functions",
          memberSymbols: [node1.symbol_id, node2.symbol_id],
        },
        {
          description: "Module 2 functions",
          memberSymbols: [node3.symbol_id],
        },
      ];

      const { nodes, edges } = generateReactFlowElements(node1, descriptions, node_groups);

      // Should have 3 function nodes + 2 module nodes
      expect(nodes).toHaveLength(5);

      const module_nodes = nodes.filter(n => n.type === "module_group");
      expect(module_nodes).toHaveLength(2);

      // Function nodes should have parentId set
      const func_node1 = nodes.find(n => n.id === node1.symbol_id);
      const func_node2 = nodes.find(n => n.id === node2.symbol_id);
      expect(func_node1?.parentId).toBe("module_0");
      expect(func_node2?.parentId).toBe("module_0");

      const func_node3 = nodes.find(n => n.id === node3.symbol_id);
      expect(func_node3?.parentId).toBe("module_1");

      // Should have inter-module edge
      const module_edges = edges.filter(e => e.id.startsWith("module-edge-"));
      expect(module_edges).toHaveLength(1);
      expect(module_edges[0].source).toBe("module_0");
      expect(module_edges[0].target).toBe("module_1");
    });

    it("should handle empty node groups", () => {
      const node = create_mock_node("func");
      const descriptions = create_mock_descriptions([node]);
      const node_groups: NodeGroup[] = [];

      const { nodes } = generateReactFlowElements(node, descriptions, node_groups);

      const module_nodes = nodes.filter(n => n.type === "module_group");
      expect(module_nodes).toHaveLength(0);
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
      delete descriptions.docstrings[node.symbol_id];

      const { nodes } = generateReactFlowElements(node, descriptions, undefined);

      expect(nodes).toHaveLength(1);
      expect(nodes[0].data.description).toBe("");
    });
  });
});
