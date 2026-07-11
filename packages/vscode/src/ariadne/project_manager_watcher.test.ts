import { AriadneProjectManager } from "./project_manager";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";

const { __mockHelpers } = require("vscode");
const { mockFileWatcherCallbacks, mockDocumentChangeCallback, mockEventEmitter } = __mockHelpers;

describe("AriadneProjectManager - File Watcher Tests", () => {
  let tempDir: string;
  let projectManager: AriadneProjectManager;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.keys(mockFileWatcherCallbacks).forEach(key => delete mockFileWatcherCallbacks[key]);
    mockDocumentChangeCallback.callback = null;
    if (mockEventEmitter.instance) {
      mockEventEmitter.callback = null;
    }

    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ariadne-watcher-test-"));
  });

  afterEach(async () => {
    if (projectManager) {
      projectManager.dispose();
    }
    await fs.promises.rm(tempDir, { recursive: true });
  });

  describe("File System Watcher", () => {
    it("reindexes on file creation events", async () => {
      projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
      await projectManager.initialize();

      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();

      const newFilePath = path.join(tempDir, "new_file.py");
      const uri = vscode.Uri.file(newFilePath);

      await fs.promises.writeFile(newFilePath, "def new_function(): pass", "utf-8");

      await mockFileWatcherCallbacks.onCreate(uri);

      const nodeSymbols = Array.from(projectManager.get_call_graph().nodes.keys());
      expect(nodeSymbols.some(s => s.includes("new_file.py"))).toBe(true);
    });

    it("reindexes on file change events", async () => {
      const testFile = path.join(tempDir, "test.py");
      await fs.promises.writeFile(testFile, "def old_function(): pass", "utf-8");

      projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
      await projectManager.initialize();

      await fs.promises.writeFile(testFile, "def updated_function(): pass", "utf-8");

      const uri = vscode.Uri.file(testFile);
      await mockFileWatcherCallbacks.onChange(uri);

      const nodeSymbols = Array.from(projectManager.get_call_graph().nodes.keys());
      expect(nodeSymbols.some(s => s.includes("updated_function"))).toBe(true);
      expect(nodeSymbols.some(s => s.includes("old_function"))).toBe(false);
    });

    it("removes a file from the graph on deletion events", async () => {
      const deletedFile = path.join(tempDir, "deleted.py");
      await fs.promises.writeFile(deletedFile, "def doomed(): pass", "utf-8");

      projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
      await projectManager.initialize();
      expect(
        Array.from(projectManager.get_call_graph().nodes.keys()).some(s => s.includes("doomed"))
      ).toBe(true);

      mockFileWatcherCallbacks.onDelete(vscode.Uri.file(deletedFile));

      const nodeSymbols = Array.from(projectManager.get_call_graph().nodes.keys());
      expect(nodeSymbols.some(s => s.includes("doomed"))).toBe(false);
    });

    it("ignores files that don't match the filter", async () => {
      projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
      await projectManager.initialize();

      const jsFile = path.join(tempDir, "test.js");
      await fs.promises.writeFile(jsFile, "function test() {}", "utf-8");

      await mockFileWatcherCallbacks.onCreate(vscode.Uri.file(jsFile));

      const nodeSymbols = Array.from(projectManager.get_call_graph().nodes.keys());
      expect(nodeSymbols.some(s => s.includes("test.js"))).toBe(false);
    });
  });

  describe("Document Change Events", () => {
    it("reindexes on text document changes", async () => {
      projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
      await projectManager.initialize();

      const docPath = path.join(tempDir, "doc.py");
      const mockDocument = {
        uri: { scheme: "file", fsPath: docPath },
        getText: jest.fn(() => "def changed_function(): return 42")
      };

      await mockDocumentChangeCallback.callback({
        document: mockDocument,
        contentChanges: []
      });

      const nodeSymbols = Array.from(projectManager.get_call_graph().nodes.keys());
      expect(nodeSymbols.some(s => s.includes("changed_function"))).toBe(true);
    });

    it("ignores document changes outside the workspace", async () => {
      projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
      await projectManager.initialize();

      const outsideDoc = {
        uri: { scheme: "file", fsPath: "/some/other/path/file.py" },
        getText: jest.fn(() => "def outside(): pass")
      };

      await mockDocumentChangeCallback.callback({
        document: outsideDoc,
        contentChanges: []
      });

      const nodeSymbols = Array.from(projectManager.get_call_graph().nodes.keys());
      expect(nodeSymbols.some(s => s.includes("outside"))).toBe(false);
    });

    it("ignores non-file scheme documents", async () => {
      projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
      await projectManager.initialize();

      const untitledDoc = {
        uri: { scheme: "untitled", fsPath: "Untitled-1" },
        getText: jest.fn(() => "def untitled(): pass")
      };

      await mockDocumentChangeCallback.callback({
        document: untitledDoc,
        contentChanges: []
      });

      const nodeSymbols = Array.from(projectManager.get_call_graph().nodes.keys());
      expect(nodeSymbols.some(s => s.includes("untitled"))).toBe(false);
    });
  });

  describe("Call Graph Change Events", () => {
    it("emits a call-graph-changed event carrying the current graph on file creation", async () => {
      const callGraphChangedHandler = jest.fn();

      projectManager = new AriadneProjectManager(tempDir);
      projectManager.on_call_graph_changed(callGraphChangedHandler);
      await projectManager.initialize();

      const newFile = path.join(tempDir, "new.py");
      await fs.promises.writeFile(newFile, "def new(): pass", "utf-8");

      await mockFileWatcherCallbacks.onCreate(vscode.Uri.file(newFile));

      expect(mockEventEmitter.instance.fire).toHaveBeenCalledWith(expect.objectContaining({
        nodes: expect.any(Map)
      }));
    });

    it("debounces rapid document changes into one event", async () => {
      jest.useFakeTimers();

      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      mockEventEmitter.instance.fire.mockClear();

      const rapidFile = path.join(tempDir, "rapid.py");
      await fs.promises.writeFile(rapidFile, "def initial(): pass", "utf-8");

      const mockDoc = {
        uri: { scheme: "file", fsPath: rapidFile },
        getText: jest.fn()
      };

      for (let i = 0; i < 5; i++) {
        mockDoc.getText.mockReturnValue(`def func${i}(): pass`);
        await mockDocumentChangeCallback.callback({
          document: mockDoc,
          contentChanges: []
        });
        jest.advanceTimersByTime(100);
      }

      expect(mockEventEmitter.instance.fire).not.toHaveBeenCalled();

      jest.advanceTimersByTime(500);

      expect(mockEventEmitter.instance.fire).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });

  describe("invalidate", () => {
    it("re-indexes on-disk files and fires a call-graph-changed event", async () => {
      const changed = jest.fn();
      projectManager = new AriadneProjectManager(tempDir);
      projectManager.on_call_graph_changed(changed);
      await projectManager.initialize();

      // A file that appears after the initial index — mimics the code an out-of-process reconcile edited
      // between the panel opening and the graph.db write that triggers invalidate().
      await fs.promises.writeFile(path.join(tempDir, "added.py"), "def added(): pass", "utf-8");
      mockEventEmitter.instance.fire.mockClear();

      await projectManager.invalidate();

      expect(mockEventEmitter.instance.fire).toHaveBeenCalledTimes(1);
      const callGraph = projectManager.get_call_graph();
      const nodeSymbols = Array.from(callGraph.nodes.keys());
      expect(nodeSymbols.some((s) => s.includes("added.py"))).toBe(true);
    });

    it("re-indexes again on a later invalidate once the in-flight run has settled", async () => {
      // Guards the run_index() in-flight-guard reset: if index_in_flight were not cleared after a run,
      // a second invalidate would ride the already-resolved promise and silently drop the later change.
      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      await fs.promises.writeFile(path.join(tempDir, "one.py"), "def one(): pass", "utf-8");
      await projectManager.invalidate();
      await fs.promises.writeFile(path.join(tempDir, "two.py"), "def two(): pass", "utf-8");
      await projectManager.invalidate();

      const nodeSymbols = Array.from(projectManager.get_call_graph().nodes.keys());
      expect(nodeSymbols.some((s) => s.includes("one.py"))).toBe(true);
      expect(nodeSymbols.some((s) => s.includes("two.py"))).toBe(true);
    });

    it("is a no-op before initialize (no project to re-index)", async () => {
      projectManager = new AriadneProjectManager(tempDir);
      mockEventEmitter.instance.fire.mockClear();

      await projectManager.invalidate();

      expect(mockEventEmitter.instance.fire).not.toHaveBeenCalled();
    });
  });

  describe("Disposal", () => {
    it("disposes every watcher subscription and the emitter", async () => {
      const mockDisposables: Array<{ dispose: jest.Mock }> = [];

      const track_disposable = () => {
        const disposable = { dispose: jest.fn() };
        mockDisposables.push(disposable);
        return disposable;
      };

      const watcher_spy = jest.spyOn(vscode.workspace, "createFileSystemWatcher")
        .mockImplementation(() => ({
          ignoreCreateEvents: false,
          ignoreChangeEvents: false,
          ignoreDeleteEvents: false,
          onDidCreate: jest.fn(track_disposable),
          onDidChange: jest.fn(track_disposable),
          onDidDelete: jest.fn(track_disposable),
          dispose: jest.fn(),
        }));

      const change_spy = jest.spyOn(vscode.workspace, "onDidChangeTextDocument")
        .mockImplementation(() => track_disposable());

      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      projectManager.dispose();

      mockDisposables.forEach(disposable => {
        expect(disposable.dispose).toHaveBeenCalled();
      });
      expect(mockEventEmitter.instance.dispose).toHaveBeenCalled();

      watcher_spy.mockRestore();
      change_spy.mockRestore();
    });
  });
});
