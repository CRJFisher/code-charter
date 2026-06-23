import {
  export_graph_state,
  import_graph_state,
  GraphState
} from "./state_persistence";
import * as state_persistence from "./state_persistence";
import { Viewport } from "@xyflow/react";
import { CodeChartNode, CodeChartEdge } from "./chart_types";

describe("state_persistence", () => {
  // task-29.3 regression. The live defect restored a stale layout snapshot from localStorage on mount
  // and returned before the layout pipeline ran, replaying a broken layout (modules at {0,0}, no
  // dimensions) forever. The fix removed that path: persistence is file-only (export/import), with no
  // localStorage load/save/clear primitive. Re-introducing any of those re-enables the restore-bypass,
  // so guard their absence here — this is the test that fails if the root cause regresses.
  describe("no layout auto-restore surface (task-29.3 regression)", () => {
    it.each(["load_graph_state", "save_graph_state", "clear_graph_state"])(
      "does not expose %s (a localStorage restore/persist primitive)",
      (name) => {
        expect(name in state_persistence).toBe(false);
      },
    );
  });

  const mockNodes: CodeChartNode[] = [
    {
      id: "node1",
      position: { x: 100, y: 100 },
      type: "code_function",
      data: {
        function_name: "Node 1",
        description: "",
        file_path: "/test/n1.ts",
        line_number: 1,
        symbol: "test::n1",
      },
    },
    {
      id: "node2",
      position: { x: 200, y: 200 },
      type: "code_function",
      data: {
        function_name: "Node 2",
        description: "",
        file_path: "/test/n2.ts",
        line_number: 1,
        symbol: "test::n2",
      },
    },
  ];

  const mockEdges: CodeChartEdge[] = [
    {
      id: "edge1",
      source: "node1",
      target: "node2",
    },
  ];

  const mockViewport: Viewport = {
    x: 50,
    y: 50,
    zoom: 1.5,
  };

  const entry_point = "test::main";

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset all mocks
    jest.restoreAllMocks();
  });

  describe("export_graph_state", () => {
    it("should create a download link with correct data", () => {
      const createElementSpy = jest.spyOn(document, "createElement");
      const clickSpy = jest.fn();
      
      // Mock the link element
      const mockLink = {
        setAttribute: jest.fn(),
        click: clickSpy,
      };
      createElementSpy.mockReturnValue(mockLink as Partial<HTMLAnchorElement> as HTMLAnchorElement);
      
      export_graph_state(mockNodes, mockEdges, mockViewport, entry_point);
      
      expect(createElementSpy).toHaveBeenCalledWith("a");
      expect(mockLink.setAttribute).toHaveBeenCalledWith(
        "href",
        expect.stringContaining("data:application/json;charset=utf-8,")
      );
      expect(mockLink.setAttribute).toHaveBeenCalledWith(
        "download",
        expect.stringMatching(/^code-graph-test__main-\d+\.json$/)
      );
      expect(clickSpy).toHaveBeenCalled();
    });

    it("should sanitize entry point in filename", () => {
      const createElementSpy = jest.spyOn(document, "createElement");
      const mockLink = {
        setAttribute: jest.fn(),
        click: jest.fn(),
      };
      createElementSpy.mockReturnValue(mockLink as Partial<HTMLAnchorElement> as HTMLAnchorElement);
      
      export_graph_state(mockNodes, mockEdges, mockViewport, "test::func/with<>special*chars");
      
      const downloadCall = mockLink.setAttribute.mock.calls.find(
        call => call[0] === "download"
      );
      expect(downloadCall?.[1]).toMatch(/^code-graph-test__func_with__special_chars-\d+\.json$/);
    });
  });

  describe("import_graph_state", () => {
    interface MockFileReader {
      onload: ((e: { target: { result: string } }) => void) | null;
      onerror: (() => void) | null;
      readAsText: jest.Mock;
      result?: string;
    }

    let mockFileReader: MockFileReader;

    beforeEach(() => {
      mockFileReader = {
        onload: null,
        onerror: null,
        readAsText: jest.fn(),
        result: undefined,
      };

      // Mock FileReader constructor on globalThis. The full DOM type chain
      // is too rich to satisfy here, so install via defineProperty.
      Object.defineProperty(globalThis, 'FileReader', {
        configurable: true,
        writable: true,
        value: jest.fn(() => mockFileReader),
      });
    });

    it("should successfully import valid graph state", (done) => {
      const validState: GraphState = {
        nodes: mockNodes,
        edges: mockEdges,
        viewport: mockViewport,
        entry_point,
        timestamp: Date.now(),
      };

      const file = new File([JSON.stringify(validState)], "state.json");
      const on_success = jest.fn((state) => {
        expect(state).toEqual(validState);
        done();
      });
      const on_error = jest.fn();

      import_graph_state(file, on_success, on_error);

      // Simulate file read completion
      mockFileReader.readAsText(file);
      mockFileReader.result = JSON.stringify(validState);
      mockFileReader.onload?.({ target: { result: JSON.stringify(validState) } });

      expect(on_error).not.toHaveBeenCalled();
    });

    it("should call on_error for invalid JSON", (done) => {
      const file = new File(["invalid json"], "state.json");
      const on_success = jest.fn();
      const on_error = jest.fn((error) => {
        expect(error).toContain("Unexpected token");
        done();
      });

      import_graph_state(file, on_success, on_error);

      mockFileReader.readAsText(file);
      mockFileReader.onload?.({ target: { result: "invalid json" } });

      expect(on_success).not.toHaveBeenCalled();
    });

    it("should call on_error for missing required fields", (done) => {
      const invalidState = {
        nodes: mockNodes,
        // missing edges, viewport, and entry_point
      };

      const file = new File([JSON.stringify(invalidState)], "state.json");
      const on_success = jest.fn();
      const on_error = jest.fn((error) => {
        expect(error).toBe("Invalid graph state file");
        done();
      });

      import_graph_state(file, on_success, on_error);

      mockFileReader.readAsText(file);
      mockFileReader.onload?.({ target: { result: JSON.stringify(invalidState) } });

      expect(on_success).not.toHaveBeenCalled();
    });

    it("should handle file read errors", (done) => {
      const file = new File(["content"], "state.json");
      const on_success = jest.fn();
      const on_error = jest.fn((error) => {
        expect(error).toBe("Failed to read file");
        done();
      });

      import_graph_state(file, on_success, on_error);

      mockFileReader.readAsText(file);
      mockFileReader.onerror?.();

      expect(on_success).not.toHaveBeenCalled();
    });

    it("should validate all required fields are present", (done) => {
      const testCases = [
        { edges: mockEdges, viewport: mockViewport, entry_point }, // missing nodes
        { nodes: mockNodes, viewport: mockViewport, entry_point }, // missing edges
        { nodes: mockNodes, edges: mockEdges, entry_point }, // missing viewport
        { nodes: mockNodes, edges: mockEdges, viewport: mockViewport }, // missing entry_point
      ];

      let completed = 0;
      
      testCases.forEach((invalidState, index) => {
        const file = new File([JSON.stringify(invalidState)], `state${index}.json`);
        const on_success = jest.fn();
        const on_error = jest.fn(() => {
          completed++;
          if (completed === testCases.length) {
            done();
          }
        });

        import_graph_state(file, on_success, on_error);

        const reader_mock = jest.mocked(FileReader);
        const reader = reader_mock.mock.results[index].value as MockFileReader;
        reader.readAsText(file);
        reader.onload?.({ target: { result: JSON.stringify(invalidState) } });

        expect(on_success).not.toHaveBeenCalled();
        expect(on_error).toHaveBeenCalledWith("Invalid graph state file");
      });
    });
  });
});