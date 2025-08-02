import { AriadneProjectManager } from "../ariadne/project_manager";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";

// Get vscode mock helpers
const vscodeMock = require("vscode");
const { mockFileWatcherCallbacks, mockDocumentChangeCallback, mockEventEmitter } = vscodeMock.__mockHelpers;

// Track all callbacks for integration testing
let callGraphChangedCallbacks: any[] = [];

describe("AriadneProjectManager - Integration Tests", () => {
  let tempDir: string;
  let projectManager: AriadneProjectManager;

  beforeEach(async () => {
    // Reset state
    callGraphChangedCallbacks = [];
    // Reset mock state
    if (mockEventEmitter.instance) {
      mockEventEmitter.instance.fire.mockClear();
    }
    
    // Create temp directory with a realistic project structure
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ariadne-integration-"));
    
    // Create a sample project structure
    const srcDir = path.join(tempDir, "src");
    const testDir = path.join(tempDir, "tests");
    const libDir = path.join(srcDir, "lib");
    
    await fs.promises.mkdir(srcDir);
    await fs.promises.mkdir(testDir);
    await fs.promises.mkdir(libDir);
    
    // Create initial files
    await fs.promises.writeFile(
      path.join(srcDir, "main.py"),
      `def main():
    print("Hello")
    utils.helper()

def secondary():
    return 42`,
      "utf-8"
    );
    
    await fs.promises.writeFile(
      path.join(libDir, "utils.py"),
      `def helper():
    return "helping"

def unused():
    pass`,
      "utf-8"
    );
    
    await fs.promises.writeFile(
      path.join(testDir, "test_main.py"),
      `def test_main():
    assert True`,
      "utf-8"
    );
  });

  afterEach(async () => {
    if (projectManager) {
      projectManager.dispose();
    }
    await fs.promises.rm(tempDir, { recursive: true });
  });

  describe("Real-world Development Workflow", () => {
    it("should handle a typical development session", async () => {
      const callGraphUpdates: any[] = [];
      
      // Initialize project manager
      projectManager = new AriadneProjectManager(tempDir, (p) => {
        // Filter out test files
        return p.endsWith(".py") && !p.includes("test");
      });
      
      projectManager.onCallGraphChanged((graph) => {
        callGraphUpdates.push({
          timestamp: Date.now(),
          nodeCount: graph.nodes.size,
          nodes: Array.from(graph.nodes.keys())
        });
      });

      const initialGraph = await projectManager.initialize();
      
      // Should have found main.py and utils.py but not test_main.py
      expect(initialGraph.nodes.size).toBeGreaterThan(0);
      const nodeSymbols = Array.from(initialGraph.nodes.keys());
      
      // Check that we found Python files but not test files
      expect(nodeSymbols.some(s => s.includes("main.py"))).toBe(true);
      expect(nodeSymbols.some(s => s.includes("utils.py"))).toBe(true);
      expect(nodeSymbols.some(s => s.includes("test_main.py"))).toBe(false);

      // Simulate adding a new feature file
      const featurePath = path.join(tempDir, "src", "feature.py");
      await fs.promises.writeFile(
        featurePath,
        `def new_feature():
    return "awesome"

def feature_helper():
    pass`,
        "utf-8"
      );
      
      // Trigger file watcher
      await mockFileWatcherCallbacks.onCreate(vscode.Uri.file(featurePath));
      
      // Wait a bit for debouncing
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Should have triggered an update
      expect(callGraphUpdates.length).toBeGreaterThan(0);
      const lastUpdate = callGraphUpdates[callGraphUpdates.length - 1];
      expect(lastUpdate.nodeCount).toBeGreaterThan(initialGraph.nodes.size); // Added functions
      
      // Simulate editing the main file
      const mainPath = path.join(tempDir, "src", "main.py");
      const updatedMainContent = `def main():
    print("Hello World")  # Changed
    utils.helper()
    new_feature()  # Added

def secondary():
    return 42

def new_function():  # Added
    return "new"`;
      
      await fs.promises.writeFile(mainPath, updatedMainContent, "utf-8");
      
      // Simulate document change event
      const mockDocument = {
        uri: vscode.Uri.file(mainPath),
        getText: () => updatedMainContent
      };
      
      await mockDocumentChangeCallback.callback({
        document: mockDocument,
        contentChanges: []
      });
      
      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Should have detected the changes
      const finalUpdate = callGraphUpdates[callGraphUpdates.length - 1];
      expect(finalUpdate.nodeCount).toBeGreaterThan(0);
      expect(finalUpdate.nodes.some(s => s.includes("main.py"))).toBe(true);
    });

    it("should handle refactoring scenario", async () => {
      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();
      
      // Simulate renaming a file (delete + create)
      const oldPath = path.join(tempDir, "src", "lib", "utils.py");
      const newPath = path.join(tempDir, "src", "lib", "utilities.py");
      
      // Delete old file
      await mockFileWatcherCallbacks.onDelete(vscode.Uri.file(oldPath));
      
      // Create new file with updated content
      await fs.promises.writeFile(
        newPath,
        `def helper():
    return "helping"

def unused():
    pass

def additional_util():  # New function added during refactor
    return True`,
        "utf-8"
      );
      
      await mockFileWatcherCallbacks.onCreate(vscode.Uri.file(newPath));
      
      // Wait for updates
      await new Promise(resolve => setTimeout(resolve, 600));
      
      const currentGraph = projectManager.getCallGraph();
      const nodeKeys = Array.from(currentGraph.nodes.keys());
      
      // Old file functions should be gone
      expect(nodeKeys).not.toEqual(
        expect.arrayContaining([
          expect.stringContaining("utils.py")
        ])
      );
      
      // New file functions should be present
      expect(nodeKeys).toEqual(
        expect.arrayContaining([
          expect.stringContaining("utilities.py:helper"),
          expect.stringContaining("utilities.py:additional_util")
        ])
      );
    });

    it("should handle rapid editing session", async () => {
      jest.useFakeTimers();
      
      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();
      
      const filePath = path.join(tempDir, "src", "rapid.py");
      let updateCount = 0;
      
      projectManager.onCallGraphChanged(() => {
        updateCount++;
      });
      
      // Simulate rapid typing/editing
      for (let i = 0; i < 10; i++) {
        const content = `def func():
    # Edit number ${i}
    return ${i}`;
        
        await fs.promises.writeFile(filePath, content, "utf-8");
        
        const mockDoc = {
          uri: vscode.Uri.file(filePath),
          getText: () => content
        };
        
        await mockDocumentChangeCallback.callback({
          document: mockDoc,
          contentChanges: []
        });
        
        // Advance time by 100ms (less than debounce timeout)
        jest.advanceTimersByTime(100);
      }
      
      // Should not have triggered updates yet
      expect(updateCount).toBe(0);
      
      // Advance past debounce timeout
      jest.advanceTimersByTime(500);
      
      // Should have triggered exactly one update
      expect(updateCount).toBe(1);
      
      jest.useRealTimers();
    });
  });

  describe("Error Recovery", () => {
    it("should recover from temporary file system errors", async () => {
      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();
      
      // Create a file that will cause an error when read
      const problematicPath = path.join(tempDir, "problematic.py");
      
      // First, make the directory read-only (Unix-like systems)
      if (process.platform !== "win32") {
        await fs.promises.chmod(tempDir, 0o555);
        
        try {
          // Try to create a file (should fail)
          await mockFileWatcherCallbacks.onCreate(vscode.Uri.file(problematicPath));
        } catch {
          // Expected to fail
        }
        
        // Restore permissions
        await fs.promises.chmod(tempDir, 0o755);
      }
      
      // Now create the file successfully
      await fs.promises.writeFile(problematicPath, "def recovered(): pass", "utf-8");
      await mockFileWatcherCallbacks.onCreate(vscode.Uri.file(problematicPath));
      
      // Should have recovered and added the file
      const graph = projectManager.getCallGraph();
      const nodeKeys = Array.from(graph.nodes.keys());
      
      if (process.platform !== "win32") {
        expect(nodeKeys).toEqual(
          expect.arrayContaining([
            expect.stringContaining("problematic.py:recovered")
          ])
        );
      }
    });
  });

  describe("Performance Characteristics", () => {
    it("should handle large number of files efficiently", async () => {
      // Create many files
      const fileCount = 50;
      const promises = [];
      
      for (let i = 0; i < fileCount; i++) {
        const filePath = path.join(tempDir, `file${i}.py`);
        const content = `def func${i}():
    return ${i}

def helper${i}():
    pass`;
        promises.push(fs.promises.writeFile(filePath, content, "utf-8"));
      }
      
      await Promise.all(promises);
      
      const startTime = Date.now();
      projectManager = new AriadneProjectManager(tempDir);
      const graph = await projectManager.initialize();
      const initTime = Date.now() - startTime;
      
      // Should complete in reasonable time (less than 5 seconds for 50 files)
      expect(initTime).toBeLessThan(5000);
      
      // Should have found functions from the files
      expect(graph.nodes.size).toBeGreaterThan(0);
      
      // Test incremental update performance
      const updateStartTime = Date.now();
      const newFilePath = path.join(tempDir, "new_file.py");
      await fs.promises.writeFile(newFilePath, "def new_func(): pass", "utf-8");
      await mockFileWatcherCallbacks.onCreate(vscode.Uri.file(newFilePath));
      const updateTime = Date.now() - updateStartTime;
      
      // Incremental update should be much faster than initial scan
      expect(updateTime).toBeLessThan(initTime / 10);
    });
  });
});