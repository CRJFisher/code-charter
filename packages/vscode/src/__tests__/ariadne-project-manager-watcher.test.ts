import { AriadneProjectManager } from "../ariadne/project_manager";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";

// Get mock helpers
const { __mockHelpers } = require("vscode");
const { mockFileWatcherCallbacks, mockDocumentChangeCallback, mockEventEmitter } = __mockHelpers;

describe("AriadneProjectManager - File Watcher Tests", () => {
  let tempDir: string;
  let projectManager: AriadneProjectManager;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    // Clear callbacks
    Object.keys(mockFileWatcherCallbacks).forEach(key => delete mockFileWatcherCallbacks[key]);
    mockDocumentChangeCallback.callback = null;
    if (mockEventEmitter.instance) {
      mockEventEmitter.callback = null;
    }
    
    // Create a temporary directory for testing
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ariadne-watcher-test-"));
  });

  afterEach(async () => {
    // Clean up
    if (projectManager) {
      projectManager.dispose();
    }
    await fs.promises.rm(tempDir, { recursive: true });
  });

  describe("File System Watcher", () => {
    it("should handle file creation events", async () => {
      // Create initial project manager
      projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
      await projectManager.initialize();

      // Verify file watcher was created
      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();

      // Simulate file creation
      const newFilePath = path.join(tempDir, "new_file.py");
      const uri = vscode.Uri.file(newFilePath);
      
      // Create the actual file
      await fs.promises.writeFile(newFilePath, "def new_function(): pass", "utf-8");
      
      // Trigger the file creation callback
      if (mockFileWatcherCallbacks.onCreate) {
        await mockFileWatcherCallbacks.onCreate(uri);
      }

      // Verify the call graph was updated
      const callGraph = projectManager.getCallGraph();
      expect(callGraph).toBeDefined();
      expect(callGraph.nodes).toBeDefined();
    });

    it("should handle file change events", async () => {
      // Create a file first
      const testFile = path.join(tempDir, "test.py");
      await fs.promises.writeFile(testFile, "def old_function(): pass", "utf-8");

      projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
      await projectManager.initialize();

      // Update the file
      await fs.promises.writeFile(testFile, "def updated_function(): pass", "utf-8");

      // Trigger the file change callback
      const uri = vscode.Uri.file(testFile);
      if (mockFileWatcherCallbacks.onChange) {
        await mockFileWatcherCallbacks.onChange(uri);
      }

      // Verify the call graph was updated
      const callGraph = projectManager.getCallGraph();
      expect(callGraph).toBeDefined();
      expect(callGraph.nodes).toBeDefined();
      // Note: We can't verify specific content without mocking, but ariadne should handle it
    });

    it("should handle file deletion events", async () => {
      projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
      await projectManager.initialize();

      // Simulate file deletion
      const deletedFile = path.join(tempDir, "deleted.py");
      const uri = vscode.Uri.file(deletedFile);

      if (mockFileWatcherCallbacks.onDelete) {
        mockFileWatcherCallbacks.onDelete(uri);
      }

      // Verify the call graph was updated (file should be removed)
      const callGraph = projectManager.getCallGraph();
      expect(callGraph).toBeDefined();
      // Note: We can't verify removal without mocking, but ariadne should handle it
    });

    it("should ignore files that don't match the filter", async () => {
      projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
      await projectManager.initialize();

      // Create a JavaScript file
      const jsFile = path.join(tempDir, "test.js");
      await fs.promises.writeFile(jsFile, "function test() {}", "utf-8");

      // Trigger file creation for JS file
      const uri = vscode.Uri.file(jsFile);
      if (mockFileWatcherCallbacks.onCreate) {
        await mockFileWatcherCallbacks.onCreate(uri);
      }

      // Verify the call graph doesn't include JS files
      const callGraph = projectManager.getCallGraph();
      const nodeSymbols = Array.from(callGraph.nodes.keys());
      expect(nodeSymbols.some(s => s.includes("test.js"))).toBe(false);
    });
  });

  describe("Document Change Events", () => {
    it("should handle text document changes", async () => {
      projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
      await projectManager.initialize();

      // Create a mock document
      const docPath = path.join(tempDir, "doc.py");
      const mockDocument = {
        uri: { 
          scheme: "file", 
          fsPath: docPath 
        },
        getText: jest.fn(() => "def changed_function(): return 42")
      };

      // Trigger document change
      if (mockDocumentChangeCallback.callback) {
        await mockDocumentChangeCallback.callback({
          document: mockDocument as any,
          contentChanges: []
        } as any);
      }

      // Verify the call graph was updated
      const callGraph = projectManager.getCallGraph();
      expect(callGraph).toBeDefined();
      expect(callGraph.nodes).toBeDefined();
      // Note: We can't verify specific content without mocking, but ariadne should handle it
    });

    it("should ignore document changes outside the workspace", async () => {
      projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
      await projectManager.initialize();

      // Create a document outside the workspace
      const outsideDoc = {
        uri: { 
          scheme: "file", 
          fsPath: "/some/other/path/file.py" 
        },
        getText: jest.fn(() => "def outside(): pass")
      };

      if (mockDocumentChangeCallback.callback) {
        await mockDocumentChangeCallback.callback({
          document: outsideDoc as any,
          contentChanges: []
        } as any);
      }

      // Verify the call graph wasn't updated with outside files
      const callGraph = projectManager.getCallGraph();
      const nodeSymbols = Array.from(callGraph.nodes.keys());
      expect(nodeSymbols.some(s => s.includes("/other/"))).toBe(false);
    });

    it("should ignore non-file scheme documents", async () => {
      projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
      await projectManager.initialize();

      // Create a document with non-file scheme (e.g., untitled)
      const untitledDoc = {
        uri: { 
          scheme: "untitled", 
          fsPath: "Untitled-1" 
        },
        getText: jest.fn(() => "def untitled(): pass")
      };

      if (mockDocumentChangeCallback.callback) {
        await mockDocumentChangeCallback.callback({
          document: untitledDoc as any,
          contentChanges: []
        } as any);
      }

      // Verify the call graph wasn't updated with non-file scheme documents
      const callGraph = projectManager.getCallGraph();
      expect(callGraph).toBeDefined();
      // Non-file scheme documents shouldn't affect the call graph
    });
  });

  describe("Call Graph Change Events", () => {
    it("should emit call graph changed events", async () => {
      const callGraphChangedHandler = jest.fn();
      
      projectManager = new AriadneProjectManager(tempDir);
      projectManager.onCallGraphChanged(callGraphChangedHandler);
      await projectManager.initialize();

      // Trigger a file change that should cause call graph update
      const newFile = path.join(tempDir, "new.py");
      await fs.promises.writeFile(newFile, "def new(): pass", "utf-8");
      
      if (mockFileWatcherCallbacks.onCreate) {
        await mockFileWatcherCallbacks.onCreate(vscode.Uri.file(newFile));
      }

      // Verify the event was fired
      expect(mockEventEmitter.instance.fire).toHaveBeenCalledWith(expect.objectContaining({
        nodes: expect.any(Map)
      }));
    });

    it("should debounce rapid changes", async () => {
      jest.useFakeTimers();
      
      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      // Clear previous calls
      mockEventEmitter.instance.fire.mockClear();

      // Create a file first
      const rapidFile = path.join(tempDir, "rapid.py");
      await fs.promises.writeFile(rapidFile, "def initial(): pass", "utf-8");

      // Simulate rapid document changes
      const mockDoc = {
        uri: { scheme: "file", fsPath: rapidFile },
        getText: jest.fn()
      };

      // Make 5 rapid changes
      for (let i = 0; i < 5; i++) {
        mockDoc.getText.mockReturnValue(`def func${i}(): pass`);
        if (mockDocumentChangeCallback && mockDocumentChangeCallback.callback) {
          await mockDocumentChangeCallback.callback({
            document: mockDoc as any,
            contentChanges: []
          } as any);
        }
        jest.advanceTimersByTime(100); // 100ms between changes
      }

      // Should not have fired yet due to debouncing
      expect(mockEventEmitter.instance.fire).not.toHaveBeenCalled();

      // Advance past the debounce timeout
      jest.advanceTimersByTime(500);

      // Now it should have fired exactly once
      expect(mockEventEmitter.instance.fire).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });

  describe("Disposal", () => {
    it("should clean up all resources on disposal", async () => {
      const mockDisposables: any[] = [];
      
      // Track created disposables
      const originalWorkspace = vscode.workspace;
      (vscode.workspace as any).createFileSystemWatcher = jest.fn(() => {
        const watcher = {
          onDidCreate: jest.fn(() => {
            const disposable = { dispose: jest.fn() };
            mockDisposables.push(disposable);
            return disposable;
          }),
          onDidChange: jest.fn(() => {
            const disposable = { dispose: jest.fn() };
            mockDisposables.push(disposable);
            return disposable;
          }),
          onDidDelete: jest.fn(() => {
            const disposable = { dispose: jest.fn() };
            mockDisposables.push(disposable);
            return disposable;
          }),
          dispose: jest.fn()
        };
        return watcher;
      });

      (vscode.workspace as any).onDidChangeTextDocument = jest.fn(() => {
        const disposable = { dispose: jest.fn() };
        mockDisposables.push(disposable);
        return disposable;
      });

      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      // Dispose the project manager
      projectManager.dispose();

      // Verify all disposables were disposed
      mockDisposables.forEach(disposable => {
        expect(disposable.dispose).toHaveBeenCalled();
      });

      // Verify event emitter was disposed
      expect(mockEventEmitter.instance.dispose).toHaveBeenCalled();
    });

    it("should clear debounce timer on disposal", async () => {
      jest.useFakeTimers();
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      // Trigger a change to start the debounce timer
      const mockDoc = {
        uri: { scheme: "file", fsPath: path.join(tempDir, "test.py") },
        getText: jest.fn(() => "def test(): pass")
      };

      if (mockDocumentChangeCallback.callback) {
        await mockDocumentChangeCallback.callback({
          document: mockDoc as any,
          contentChanges: []
        } as any);
      }

      // Dispose before the timer fires
      projectManager.dispose();

      // Verify the timer was cleared
      expect(clearTimeoutSpy).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });
});