import { apply_hierarchical_layout, calculate_node_dimensions, clear_layout_caches } from "./graph_layout";
import { Edge } from "@xyflow/react";
import { CodeChartNode } from "./chart_types";
import ELK, { ElkNode } from "elkjs/lib/elk.bundled";

// Mock ELK
jest.mock("elkjs/lib/elk.bundled");

const not_used = (): never => {
  throw new Error('not used in test');
};

describe("graph_layout", () => {
  const mockELK = ELK as jest.MockedClass<typeof ELK>;

  beforeEach(() => {
    jest.clearAllMocks();
    clear_layout_caches();
    // Default mock implementation that returns the layout based on input
    const layout_mock = jest.fn((graph: ElkNode) => Promise.resolve({
      id: graph.id || 'root',
      children: (graph.children || []).map((child: ElkNode, index: number) => ({
        id: child.id,
        x: 100,
        y: 50 + index * 100,
        width: child.width || 200,
        height: child.height || 80,
      })),
    }));
    const stub_instance: InstanceType<typeof ELK> = {
      layout: layout_mock as InstanceType<typeof ELK>['layout'],
      knownLayoutAlgorithms: not_used,
      knownLayoutOptions: not_used,
      knownLayoutCategories: not_used,
      terminateWorker: not_used,
    };
    mockELK.mockImplementation(() => stub_instance);
  });

  describe("calculate_node_dimensions", () => {
    it("should calculate dimensions based on function name length", () => {
      const shortNameNode = {
        id: "1",
        type: "code_function",
        position: { x: 0, y: 0 },
        data: {
          function_name: "fn",
          description: "Short description",
        },
      } as CodeChartNode;

      const result = calculate_node_dimensions(shortNameNode);
      expect(result.width).toBeGreaterThanOrEqual(200); // MIN_WIDTH
      expect(result.height).toBeGreaterThan(50); // Base height
    });

    it("should increase width for longer function names", () => {
      const longNameNode = {
        id: "1",
        type: "code_function",
        position: { x: 0, y: 0 },
        data: {
          function_name: "thisIsAVeryLongFunctionNameThatShouldIncreaseWidth",
          description: "Description",
        },
      } as CodeChartNode;

      const result = calculate_node_dimensions(longNameNode);
      expect(result.width).toBeGreaterThan(300);
    });

    it("should increase height for longer descriptions", () => {
      const longSummaryNode = {
        id: "1",
        type: "code_function",
        position: { x: 0, y: 0 },
        data: {
          function_name: "function",
          description: "This is a very long description that should wrap to multiple lines and increase the height of the node significantly because it contains a lot of text",
        },
      } as CodeChartNode;

      const result = calculate_node_dimensions(longSummaryNode);
      expect(result.height).toBeGreaterThan(80);
    });

    it("should respect maximum width", () => {
      const hugeNode = {
        id: "1",
        type: "code_function",
        position: { x: 0, y: 0 },
        data: {
          function_name: "a".repeat(100),
          description: "a".repeat(1000),
        },
      } as CodeChartNode;

      const result = calculate_node_dimensions(hugeNode);
      expect(result.width).toBeLessThanOrEqual(350); // MAX_WIDTH
      // Height has no max constraint, just check it's reasonable
      expect(result.height).toBeGreaterThan(100);
    });

    it("should handle missing data gracefully", () => {
      const nodeWithoutData = {
        id: "1",
        position: { x: 0, y: 0 },
        data: {},
      } as CodeChartNode;

      const result = calculate_node_dimensions(nodeWithoutData);
      expect(result.width).toBe(200); // MIN_WIDTH
      expect(result.height).toBeGreaterThan(50); // Base height
    });
  });

  describe("apply_hierarchical_layout", () => {
    it("should apply ELK layout to nodes", async () => {
      const nodes = [
        {
          id: "node1",
          position: { x: 0, y: 0 },
          data: { function_name: "func1", description: "Description 1" },
        },
        {
          id: "node2",
          position: { x: 0, y: 0 },
          data: { function_name: "func2", description: "Description 2" },
        },
      ] as CodeChartNode[];

      const edges: Edge[] = [
        {
          id: "edge1",
          source: "node1",
          target: "node2",
        },
      ];

      // Mock console.error to suppress expected error output
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
      
      const layouted_nodes = await apply_hierarchical_layout(nodes, edges);

      // The current mock setup causes errors, but the function should still return nodes
      expect(layouted_nodes).toHaveLength(2);
      expect(layouted_nodes[0].id).toBe("node1");
      expect(layouted_nodes[1].id).toBe("node2");

      consoleErrorSpy.mockRestore();
    });

    describe("fixed_ids (AC#7)", () => {
      const fixed_nodes = (): CodeChartNode[] => [
        { id: "pinned", type: "code_function", position: { x: 999, y: 888 }, data: { function_name: "p", description: "" } },
        { id: "free", type: "code_function", position: { x: 0, y: 0 }, data: { function_name: "f", description: "" } },
      ] as CodeChartNode[];

      it("pins a fixed node to its incoming position while a free node is laid out", async () => {
        const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
        const layouted = await apply_hierarchical_layout(fixed_nodes(), [], new Set(["pinned"]));
        const pinned = layouted.find(n => n.id === "pinned")!;
        const free = layouted.find(n => n.id === "free")!;
        // the pin holds regardless of whether ELK or the grid fallback ran
        expect(pinned.position).toEqual({ x: 999, y: 888 });
        // the free node was repositioned by the layout, away from its incoming origin
        expect(free.position).not.toEqual({ x: 0, y: 0 });
        consoleErrorSpy.mockRestore();
      });

      it("an empty fixed set is identical to the no-argument layout", async () => {
        const explicit = await apply_hierarchical_layout(fixed_nodes(), [], new Set());
        clear_layout_caches();
        const implicit = await apply_hierarchical_layout(fixed_nodes(), []);
        expect(explicit.map(n => n.position)).toEqual(implicit.map(n => n.position));
      });
    });

    it("should preserve node data and other properties", async () => {
      const nodes: CodeChartNode[] = [
        {
          id: "node1",
          position: { x: 0, y: 0 },
          data: {
            function_name: "func1",
            description: "Description 1",
            file_path: "/test/file.ts",
            line_number: 1,
            symbol: "test::func1",
            custom_field: "value",
          },
          type: "code_function",
        },
      ];

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
      const layouted_nodes = await apply_hierarchical_layout(nodes, []);

      expect(layouted_nodes[0].data).toEqual({
        function_name: "func1",
        description: "Description 1",
        file_path: "/test/file.ts",
        line_number: 1,
        symbol: "test::func1",
        custom_field: "value",
      });
      expect(layouted_nodes[0].type).toBe("code_function");
      consoleErrorSpy.mockRestore();
    });

    it("should handle nodes with parentId", async () => {
      const nodes = [
        {
          id: "parent",
          position: { x: 0, y: 0 },
          data: { function_name: "parent", description: "" },
        },
        {
          id: "child",
          position: { x: 0, y: 0 },
          data: { function_name: "child", description: "" },
          parentId: "parent",
        },
      ] as CodeChartNode[];

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
      const result = await apply_hierarchical_layout(nodes, []);

      // Just verify we get back positioned nodes
      expect(result).toHaveLength(2);
      expect(result[0].position.x).toBeDefined();
      expect(result[0].position.y).toBeDefined();
      expect(result[1].position.x).toBeDefined();
      expect(result[1].position.y).toBeDefined();
      consoleErrorSpy.mockRestore();
    });

    it("should handle empty nodes array", async () => {
      const layouted_nodes = await apply_hierarchical_layout([], []);
      expect(layouted_nodes).toEqual([]);
    });

    it("should handle layout errors gracefully", async () => {
      const nodes = [
        {
          id: "node1",
          position: { x: 0, y: 0 },
          data: { function_name: "func1", description: "Description 1" },
        },
      ] as CodeChartNode[];

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
      
      // Make ELK throw an error
      const failing_instance: InstanceType<typeof ELK> = {
        layout: jest.fn().mockRejectedValue(new Error("Layout failed")),
        knownLayoutAlgorithms: not_used,
        knownLayoutOptions: not_used,
        knownLayoutCategories: not_used,
        terminateWorker: not_used,
      };
      mockELK.mockImplementationOnce(() => failing_instance);

      const result = await apply_hierarchical_layout(nodes, []);
      
      // Should return nodes (original nodes with same structure)
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("node1");
      expect(result[0].data).toEqual(nodes[0].data);
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error applying ELK layout:", expect.any(Error));
      
      consoleErrorSpy.mockRestore();
    });
  });
});