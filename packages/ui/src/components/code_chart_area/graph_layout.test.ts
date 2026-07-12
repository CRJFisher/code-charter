import { apply_hierarchical_layout, clear_layout_caches } from "./graph_layout";
import { Edge } from "@xyflow/react";
import { CodeChartNode } from "./chart_types";
import ELK, { ElkNode } from "elkjs/lib/elk.bundled";

jest.mock("elkjs/lib/elk.bundled");

const not_used = (): never => {
  throw new Error('not used in test');
};

describe("graph_layout", () => {
  const mockELK = ELK as jest.MockedClass<typeof ELK>;

  beforeEach(() => {
    jest.clearAllMocks();
    clear_layout_caches();
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

  describe("apply_hierarchical_layout", () => {
    it("applies ELK layout to nodes", async () => {
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

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      const layouted_nodes = await apply_hierarchical_layout(nodes, edges);

      expect(layouted_nodes).toHaveLength(2);
      expect(layouted_nodes[0].id).toBe("node1");
      expect(layouted_nodes[1].id).toBe("node2");

      consoleErrorSpy.mockRestore();
    });

    it("preserves node data and other properties", async () => {
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

    it("handles nodes with parentId", async () => {
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

      expect(result).toHaveLength(2);
      expect(result[0].position.x).toBeDefined();
      expect(result[0].position.y).toBeDefined();
      expect(result[1].position.x).toBeDefined();
      expect(result[1].position.y).toBeDefined();
      consoleErrorSpy.mockRestore();
    });

    it("handles empty nodes array", async () => {
      const layouted_nodes = await apply_hierarchical_layout([], []);
      expect(layouted_nodes).toEqual([]);
    });

    it("falls back to grid layout when ELK throws", async () => {
      const nodes = [
        {
          id: "node1",
          position: { x: 0, y: 0 },
          data: { function_name: "func1", description: "Description 1" },
        },
      ] as CodeChartNode[];

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      const failing_instance: InstanceType<typeof ELK> = {
        layout: jest.fn().mockRejectedValue(new Error("Layout failed")),
        knownLayoutAlgorithms: not_used,
        knownLayoutOptions: not_used,
        knownLayoutCategories: not_used,
        terminateWorker: not_used,
      };
      mockELK.mockImplementationOnce(() => failing_instance);

      const result = await apply_hierarchical_layout(nodes, []);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("node1");
      expect(result[0].data).toEqual(nodes[0].data);
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error applying ELK layout:", expect.any(Error));

      consoleErrorSpy.mockRestore();
    });
  });
});