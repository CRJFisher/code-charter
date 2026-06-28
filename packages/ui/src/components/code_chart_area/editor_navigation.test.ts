import { navigate_to_file } from "./editor_navigation";

type AcquireVsCodeApi = typeof globalThis.acquireVsCodeApi;

describe("navigate_to_file", () => {
  let original_acquire_vs_code_api: AcquireVsCodeApi | undefined;
  let mock_open: jest.SpyInstance<ReturnType<Window["open"]>, Parameters<Window["open"]>>;
  let console_error_spy: jest.SpyInstance;

  beforeEach(() => {
    original_acquire_vs_code_api = globalThis.acquireVsCodeApi;

    // Drop acquireVsCodeApi so navigate_to_file takes the window.open branch.
    delete (globalThis as Partial<typeof globalThis>).acquireVsCodeApi;

    mock_open = jest.spyOn(window, "open").mockImplementation(() => null);
    mock_open.mockClear();

    console_error_spy = jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    if (original_acquire_vs_code_api) {
      globalThis.acquireVsCodeApi = original_acquire_vs_code_api;
    }
    mock_open.mockRestore();
    console_error_spy.mockRestore();
  });

  it("opens a vscode URL with the file path and line number", () => {
    navigate_to_file({
      file_path: "/Users/test/project/src/index.ts",
      line_number: 42,
    });

    expect(mock_open).toHaveBeenCalledWith(
      "vscode://file//Users/test/project/src/index.ts:42:1",
      "_blank"
    );
  });

  it("handles file paths without a leading slash", () => {
    navigate_to_file({
      file_path: "src/components/App.tsx",
      line_number: 10,
    });

    expect(mock_open).toHaveBeenCalledWith(
      "vscode://file/src/components/App.tsx:10:1",
      "_blank"
    );
  });

  it("handles line number 0", () => {
    navigate_to_file({
      file_path: "/path/to/file.js",
      line_number: 0,
    });

    expect(mock_open).toHaveBeenCalledWith(
      "vscode://file//path/to/file.js:0:1",
      "_blank"
    );
  });

  it("includes an explicit column number", () => {
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

  it("handles paths with spaces", () => {
    navigate_to_file({
      file_path: "/Users/test/My Documents/project/file.ts",
      line_number: 1,
    });

    expect(mock_open).toHaveBeenCalledWith(
      "vscode://file//Users/test/My Documents/project/file.ts:1:1",
      "_blank"
    );
  });

  it("handles paths with special characters", () => {
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
    it("swallows window.open failures and logs them", () => {
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

    it("tolerates window.open returning null", () => {
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
    it("posts navigate_to_doc through the VS Code API when available", () => {
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