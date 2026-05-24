import {
  save_graph_state,
  load_graph_state,
  clear_graph_state,
  export_graph_state,
  import_graph_state,
  GraphState
} from "./state_persistence";
import { Viewport } from "@xyflow/react";
import { CodeChartNode, CodeChartEdge } from "./chart_types";

describe("state_persistence", () => {
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
    // Clear localStorage before each test
    localStorage.clear();
    jest.clearAllMocks();
    // Reset all mocks
    jest.restoreAllMocks();
  });

  describe("save_graph_state", () => {
    it("should save graph state to localStorage", () => {
      const setItemSpy = jest.spyOn(Storage.prototype, "setItem");
      
      save_graph_state(mockNodes, mockEdges, mockViewport, entry_point);
      
      expect(setItemSpy).toHaveBeenCalledWith(
        "code-charter-react-flow-state",
        expect.any(String)
      );
      
      const savedData = JSON.parse(setItemSpy.mock.calls[0][1]);
      expect(savedData.nodes).toEqual(mockNodes);
      expect(savedData.edges).toEqual(mockEdges);
      expect(savedData.viewport).toEqual(mockViewport);
      expect(savedData.entry_point).toBe(entry_point);
      expect(savedData.timestamp).toBeDefined();
    });

    it("should handle localStorage errors gracefully", () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
      jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("Storage full");
      });
      
      expect(() => {
        save_graph_state(mockNodes, mockEdges, mockViewport, entry_point);
      }).not.toThrow();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to save graph state:",
        expect.any(Error)
      );
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe("load_graph_state", () => {
    it("should load graph state from localStorage", () => {
      const state = {
        nodes: mockNodes,
        edges: mockEdges,
        viewport: mockViewport,
        entry_point,
        timestamp: Date.now(),
      };
      
      localStorage.setItem("code-charter-react-flow-state", JSON.stringify(state));
      
      const loaded = load_graph_state(entry_point);
      
      expect(loaded).toEqual(state);
    });

    it("should return null if no saved state exists", () => {
      const loaded = load_graph_state(entry_point);
      
      expect(loaded).toBeNull();
    });

    it("should return null if entry point doesn't match", () => {
      const state = {
        nodes: mockNodes,
        edges: mockEdges,
        viewport: mockViewport,
        entry_point: "different::entry",
        timestamp: Date.now(),
      };
      
      localStorage.setItem("code-charter-react-flow-state", JSON.stringify(state));
      
      const loaded = load_graph_state(entry_point);
      
      expect(loaded).toBeNull();
    });

    it("should return null if state is older than 24 hours", () => {
      const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      const state = {
        nodes: mockNodes,
        edges: mockEdges,
        viewport: mockViewport,
        entry_point,
        timestamp: oldTimestamp,
      };
      
      localStorage.setItem("code-charter-react-flow-state", JSON.stringify(state));
      
      const loaded = load_graph_state(entry_point);
      
      expect(loaded).toBeNull();
    });

    it("should handle corrupted data gracefully", () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
      localStorage.setItem("code-charter-react-flow-state", "invalid json");
      
      const loaded = load_graph_state(entry_point);
      
      expect(loaded).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to load graph state:",
        expect.any(Error)
      );
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe("clear_graph_state", () => {
    it("should remove graph state from localStorage", () => {
      localStorage.setItem("code-charter-react-flow-state", "some data");
      
      clear_graph_state();
      
      expect(localStorage.getItem("code-charter-react-flow-state")).toBeNull();
    });

    it("should handle errors gracefully", () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
      jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new Error("Storage error");
      });
      
      expect(() => {
        clear_graph_state();
      }).not.toThrow();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to clear graph state:",
        expect.any(Error)
      );
      
      consoleErrorSpy.mockRestore();
    });
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