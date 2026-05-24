import { navigate_to_file } from "./editor_navigation";

type AcquireVsCodeApi = typeof globalThis.acquireVsCodeApi;

describe("navigate_to_file", () => {
  let original_acquire_vs_code_api: AcquireVsCodeApi | undefined;
  let mock_open: jest.SpyInstance<ReturnType<Window["open"]>, Parameters<Window["open"]>>;
  let console_error_spy: jest.SpyInstance;

  beforeEach(() => {
    // Save original acquireVsCodeApi
    original_acquire_vs_code_api = globalThis.acquireVsCodeApi;

    // Remove acquireVsCodeApi to test window.open path
    delete (globalThis as Partial<typeof globalThis>).acquireVsCodeApi;

    // Mock window.open
    mock_open = jest.spyOn(window, "open").mockImplementation(() => null);
    mock_open.mockClear();

    // Mock console.error
    console_error_spy = jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    // Restore original acquireVsCodeApi
    if (original_acquire_vs_code_api) {
      globalThis.acquireVsCodeApi = original_acquire_vs_code_api;
    }
    mock_open.mockRestore();
    console_error_spy.mockRestore();
  });

  it("should open vscode URL with correct file path and line number", () => {
    navigate_to_file({
      file_path: "/Users/test/project/src/index.ts",
      line_number: 42,
    });

    expect(mock_open).toHaveBeenCalledWith(
      "vscode://file//Users/test/project/src/index.ts:42:1",
      "_blank"
    );
  });

  it("should handle file paths without leading slash", () => {
    navigate_to_file({
      file_path: "src/components/App.tsx",
      line_number: 10,
    });

    expect(mock_open).toHaveBeenCalledWith(
      "vscode://file/src/components/App.tsx:10:1",
      "_blank"
    );
  });

  it("should handle line number 0", () => {
    navigate_to_file({
      file_path: "/path/to/file.js",
      line_number: 0,
    });

    expect(mock_open).toHaveBeenCalledWith(
      "vscode://file//path/to/file.js:0:1",
      "_blank"
    );
  });

  it("should specify column number", () => {
    navigate_to_file({
      file_path: "/test/file.ts",
      line_number: 5,
      column_number: 10,
    });

    expect(mock_open).toHaveBeenCalledWith(
      "vscode://file//test/file.ts:5:10",
      "_blank"
    );
  });

  it("should handle paths with spaces", () => {
    navigate_to_file({
      file_path: "/Users/test/My Documents/project/file.ts",
      line_number: 1,
    });

    expect(mock_open).toHaveBeenCalledWith(
      "vscode://file//Users/test/My Documents/project/file.ts:1:1",
      "_blank"
    );
  });

  it("should handle paths with special characters", () => {
    navigate_to_file({
      file_path: "/path/to/file-with-dashes_and_underscores.ts",
      line_number: 100,
    });

    expect(mock_open).toHaveBeenCalledWith(
      "vscode://file//path/to/file-with-dashes_and_underscores.ts:100:1",
      "_blank"
    );
  });

  describe("error handling", () => {
    it("should handle window.open failures gracefully", () => {
      mock_open.mockImplementation(() => {
        throw new Error("Popup blocked");
      });

      expect(() => {
        navigate_to_file({
          file_path: "/test/file.ts",
          line_number: 1,
        });
      }).not.toThrow();
      
      expect(console_error_spy).toHaveBeenCalledWith(
        "Failed to navigate to file:",
        expect.any(Error)
      );
    });

    it("should work when window.open returns null", () => {
      mock_open.mockReturnValue(null);

      expect(() => {
        navigate_to_file({
          file_path: "/test/file.ts",
          line_number: 1,
        });
      }).not.toThrow();

      expect(mock_open).toHaveBeenCalled();
    });
  });
  
  describe("VS Code context", () => {
    it("should use VS Code API when available", () => {
      const mock_vscode = {
        postMessage: jest.fn(),
        getState: jest.fn(),
        setState: jest.fn(),
      };
      const mock_acquire_vs_code_api = jest.fn(() => mock_vscode);
      globalThis.acquireVsCodeApi = mock_acquire_vs_code_api;

      navigate_to_file({
        file_path: "/test/file.ts",
        line_number: 10,
        column_number: 5,
      });

      expect(mock_acquire_vs_code_api).toHaveBeenCalled();
      expect(mock_vscode.postMessage).toHaveBeenCalledWith({
        command: "navigate_to_doc",
        file_path: "/test/file.ts",
        line_number: 10,
        column_number: 5,
      });
      expect(mock_open).not.toHaveBeenCalled();
    });
  });
});