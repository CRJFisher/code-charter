import { 
  saveGraphState, 
  loadGraphState, 
  clearGraphState,
  exportGraphState,
  importGraphState,
  GraphState
} from "../state_persistence";
import { Node, Edge, Viewport } from "@xyflow/react";

describe("state_persistence", () => {
  const mockNodes: Node[] = [
    {
      id: "node1",
      position: { x: 100, y: 100 },
      data: { label: "Node 1" },
    },
    {
      id: "node2", 
      position: { x: 200, y: 200 },
      data: { label: "Node 2" },
    },
  ];

  const mockEdges: Edge[] = [
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

  const entryPoint = "test::main";

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    jest.clearAllMocks();
    // Reset all mocks
    jest.restoreAllMocks();
  });

  describe("saveGraphState", () => {
    it("should save graph state to localStorage", () => {
      const setItemSpy = jest.spyOn(Storage.prototype, "setItem");
      
      saveGraphState(mockNodes, mockEdges, mockViewport, entryPoint);
      
      expect(setItemSpy).toHaveBeenCalledWith(
        "code-charter-react-flow-state",
        expect.any(String)
      );
      
      const savedData = JSON.parse(setItemSpy.mock.calls[0][1]);
      expect(savedData.nodes).toEqual(mockNodes);
      expect(savedData.edges).toEqual(mockEdges);
      expect(savedData.viewport).toEqual(mockViewport);
      expect(savedData.entryPoint).toBe(entryPoint);
      expect(savedData.timestamp).toBeDefined();
    });

    it("should handle localStorage errors gracefully", () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
      jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("Storage full");
      });
      
      expect(() => {
        saveGraphState(mockNodes, mockEdges, mockViewport, entryPoint);
      }).not.toThrow();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to save graph state:",
        expect.any(Error)
      );
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe("loadGraphState", () => {
    it("should load graph state from localStorage", () => {
      const state = {
        nodes: mockNodes,
        edges: mockEdges,
        viewport: mockViewport,
        entryPoint,
        timestamp: Date.now(),
      };
      
      localStorage.setItem("code-charter-react-flow-state", JSON.stringify(state));
      
      const loaded = loadGraphState(entryPoint);
      
      expect(loaded).toEqual(state);
    });

    it("should return null if no saved state exists", () => {
      const loaded = loadGraphState(entryPoint);
      
      expect(loaded).toBeNull();
    });

    it("should return null if entry point doesn't match", () => {
      const state = {
        nodes: mockNodes,
        edges: mockEdges,
        viewport: mockViewport,
        entryPoint: "different::entry",
        timestamp: Date.now(),
      };
      
      localStorage.setItem("code-charter-react-flow-state", JSON.stringify(state));
      
      const loaded = loadGraphState(entryPoint);
      
      expect(loaded).toBeNull();
    });

    it("should return null if state is older than 24 hours", () => {
      const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      const state = {
        nodes: mockNodes,
        edges: mockEdges,
        viewport: mockViewport,
        entryPoint,
        timestamp: oldTimestamp,
      };
      
      localStorage.setItem("code-charter-react-flow-state", JSON.stringify(state));
      
      const loaded = loadGraphState(entryPoint);
      
      expect(loaded).toBeNull();
    });

    it("should handle corrupted data gracefully", () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
      localStorage.setItem("code-charter-react-flow-state", "invalid json");
      
      const loaded = loadGraphState(entryPoint);
      
      expect(loaded).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to load graph state:",
        expect.any(Error)
      );
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe("clearGraphState", () => {
    it("should remove graph state from localStorage", () => {
      localStorage.setItem("code-charter-react-flow-state", "some data");
      
      clearGraphState();
      
      expect(localStorage.getItem("code-charter-react-flow-state")).toBeNull();
    });

    it("should handle errors gracefully", () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
      jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new Error("Storage error");
      });
      
      expect(() => {
        clearGraphState();
      }).not.toThrow();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to clear graph state:",
        expect.any(Error)
      );
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe("exportGraphState", () => {
    it("should create a download link with correct data", () => {
      const createElementSpy = jest.spyOn(document, "createElement");
      const clickSpy = jest.fn();
      
      // Mock the link element
      const mockLink = {
        setAttribute: jest.fn(),
        click: clickSpy,
      };
      createElementSpy.mockReturnValue(mockLink as any);
      
      exportGraphState(mockNodes, mockEdges, mockViewport, entryPoint);
      
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
      createElementSpy.mockReturnValue(mockLink as any);
      
      exportGraphState(mockNodes, mockEdges, mockViewport, "test::func/with<>special*chars");
      
      const downloadCall = mockLink.setAttribute.mock.calls.find(
        call => call[0] === "download"
      );
      expect(downloadCall?.[1]).toMatch(/^code-graph-test__func_with__special_chars-\d+\.json$/);
    });
  });

  describe("importGraphState", () => {
    let mockFileReader: {
      onload: ((e: any) => void) | null;
      onerror: (() => void) | null;
      readAsText: jest.Mock;
      result?: string;
    };

    beforeEach(() => {
      mockFileReader = {
        onload: null,
        onerror: null,
        readAsText: jest.fn(),
        result: undefined,
      };
      
      // Mock FileReader constructor
      (global as any).FileReader = jest.fn(() => mockFileReader);
    });

    it("should successfully import valid graph state", (done) => {
      const validState: GraphState = {
        nodes: mockNodes,
        edges: mockEdges,
        viewport: mockViewport,
        entryPoint,
        timestamp: Date.now(),
      };

      const file = new File([JSON.stringify(validState)], "state.json");
      const onSuccess = jest.fn((state) => {
        expect(state).toEqual(validState);
        done();
      });
      const onError = jest.fn();

      importGraphState(file, onSuccess, onError);

      // Simulate file read completion
      mockFileReader.readAsText(file);
      mockFileReader.result = JSON.stringify(validState);
      mockFileReader.onload?.({ target: { result: JSON.stringify(validState) } } as any);

      expect(onError).not.toHaveBeenCalled();
    });

    it("should call onError for invalid JSON", (done) => {
      const file = new File(["invalid json"], "state.json");
      const onSuccess = jest.fn();
      const onError = jest.fn((error) => {
        expect(error).toContain("Unexpected token");
        done();
      });

      importGraphState(file, onSuccess, onError);

      mockFileReader.readAsText(file);
      mockFileReader.onload?.({ target: { result: "invalid json" } } as any);

      expect(onSuccess).not.toHaveBeenCalled();
    });

    it("should call onError for missing required fields", (done) => {
      const invalidState = {
        nodes: mockNodes,
        // missing edges, viewport, and entryPoint
      };

      const file = new File([JSON.stringify(invalidState)], "state.json");
      const onSuccess = jest.fn();
      const onError = jest.fn((error) => {
        expect(error).toBe("Invalid graph state file");
        done();
      });

      importGraphState(file, onSuccess, onError);

      mockFileReader.readAsText(file);
      mockFileReader.onload?.({ target: { result: JSON.stringify(invalidState) } } as any);

      expect(onSuccess).not.toHaveBeenCalled();
    });

    it("should handle file read errors", (done) => {
      const file = new File(["content"], "state.json");
      const onSuccess = jest.fn();
      const onError = jest.fn((error) => {
        expect(error).toBe("Failed to read file");
        done();
      });

      importGraphState(file, onSuccess, onError);

      mockFileReader.readAsText(file);
      mockFileReader.onerror?.();

      expect(onSuccess).not.toHaveBeenCalled();
    });

    it("should validate all required fields are present", (done) => {
      const testCases = [
        { edges: mockEdges, viewport: mockViewport, entryPoint }, // missing nodes
        { nodes: mockNodes, viewport: mockViewport, entryPoint }, // missing edges
        { nodes: mockNodes, edges: mockEdges, entryPoint }, // missing viewport
        { nodes: mockNodes, edges: mockEdges, viewport: mockViewport }, // missing entryPoint
      ];

      let completed = 0;
      
      testCases.forEach((invalidState, index) => {
        const file = new File([JSON.stringify(invalidState)], `state${index}.json`);
        const onSuccess = jest.fn();
        const onError = jest.fn(() => {
          completed++;
          if (completed === testCases.length) {
            done();
          }
        });

        importGraphState(file, onSuccess, onError);

        const reader = (FileReader as any).mock.results[index].value;
        reader.readAsText(file);
        reader.onload?.({ target: { result: JSON.stringify(invalidState) } } as any);

        expect(onSuccess).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith("Invalid graph state file");
      });
    });
  });
});