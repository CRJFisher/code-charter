import { navigateToFile } from "../navigation_utils";

describe("navigateToFile", () => {
  let originalAcquireVsCodeApi: any;
  let mockOpen: jest.Mock;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Save original acquireVsCodeApi
    originalAcquireVsCodeApi = (global as any).acquireVsCodeApi;
    
    // Remove acquireVsCodeApi to test window.open path
    delete (global as any).acquireVsCodeApi;
    
    // Mock window.open
    mockOpen = jest.fn();
    (global as any).window.open = mockOpen;
    
    // Mock console.error
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    // Restore original acquireVsCodeApi
    if (originalAcquireVsCodeApi) {
      (global as any).acquireVsCodeApi = originalAcquireVsCodeApi;
    }
    consoleErrorSpy.mockRestore();
  });

  it("should open vscode URL with correct file path and line number", () => {
    navigateToFile({
      file_path: "/Users/test/project/src/index.ts",
      line_number: 42,
    });

    expect(mockOpen).toHaveBeenCalledWith(
      "vscode://file//Users/test/project/src/index.ts:42:1",
      "_blank"
    );
  });

  it("should handle file paths without leading slash", () => {
    navigateToFile({
      file_path: "src/components/App.tsx",
      line_number: 10,
    });

    expect(mockOpen).toHaveBeenCalledWith(
      "vscode://file/src/components/App.tsx:10:1",
      "_blank"
    );
  });

  it("should handle line number 0", () => {
    navigateToFile({
      file_path: "/path/to/file.js",
      line_number: 0,
    });

    expect(mockOpen).toHaveBeenCalledWith(
      "vscode://file//path/to/file.js:0:1",
      "_blank"
    );
  });

  it("should specify column number", () => {
    navigateToFile({
      file_path: "/test/file.ts",
      line_number: 5,
      column_number: 10,
    });

    expect(mockOpen).toHaveBeenCalledWith(
      "vscode://file//test/file.ts:5:10",
      "_blank"
    );
  });

  it("should handle paths with spaces", () => {
    navigateToFile({
      file_path: "/Users/test/My Documents/project/file.ts",
      line_number: 1,
    });

    expect(mockOpen).toHaveBeenCalledWith(
      "vscode://file//Users/test/My Documents/project/file.ts:1:1",
      "_blank"
    );
  });

  it("should handle paths with special characters", () => {
    navigateToFile({
      file_path: "/path/to/file-with-dashes_and_underscores.ts",
      line_number: 100,
    });

    expect(mockOpen).toHaveBeenCalledWith(
      "vscode://file//path/to/file-with-dashes_and_underscores.ts:100:1",
      "_blank"
    );
  });

  describe("error handling", () => {
    it("should handle window.open failures gracefully", () => {
      mockOpen.mockImplementation(() => {
        throw new Error("Popup blocked");
      });

      expect(() => {
        navigateToFile({
          file_path: "/test/file.ts",
          line_number: 1,
        });
      }).not.toThrow();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to navigate to file:",
        expect.any(Error)
      );
    });

    it("should work when window.open returns null", () => {
      mockOpen.mockReturnValue(null);

      expect(() => {
        navigateToFile({
          file_path: "/test/file.ts",
          line_number: 1,
        });
      }).not.toThrow();

      expect(mockOpen).toHaveBeenCalled();
    });
  });
  
  describe("VS Code context", () => {
    it("should use VS Code API when available", () => {
      const mockVscode = {
        postMessage: jest.fn(),
      };
      const mockAcquireVsCodeApi = jest.fn(() => mockVscode);
      (global as any).acquireVsCodeApi = mockAcquireVsCodeApi;
      
      navigateToFile({
        file_path: "/test/file.ts",
        line_number: 10,
        column_number: 5,
      });
      
      expect(mockAcquireVsCodeApi).toHaveBeenCalled();
      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        command: "openFile",
        file_path: "/test/file.ts",
        line_number: 10,
        column_number: 5,
      });
      expect(mockOpen).not.toHaveBeenCalled();
    });
  });
});