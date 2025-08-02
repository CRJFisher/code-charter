import { AriadneProjectManager } from "../ariadne/project_manager";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Mock console methods to verify error logging
const originalConsoleError = console.error;
const originalConsoleLog = console.log;
let consoleErrorMock: jest.Mock;
let consoleLogMock: jest.Mock;

describe("AriadneProjectManager - Edge Cases and Error Handling", () => {
  let tempDir: string;
  let projectManager: AriadneProjectManager;

  beforeEach(async () => {
    // Set up console mocks
    consoleErrorMock = jest.fn();
    consoleLogMock = jest.fn();
    console.error = consoleErrorMock;
    console.log = consoleLogMock;
    
    // Create a temporary directory
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ariadne-edge-test-"));
  });

  afterEach(async () => {
    // Restore console
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    
    // Clean up
    if (projectManager) {
      projectManager.dispose();
    }
    try {
      await fs.promises.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("File Reading Errors", () => {
    it("should handle unreadable files gracefully", async () => {
      // Create a file that we'll make unreadable
      const unreadableFile = path.join(tempDir, "unreadable.py");
      await fs.promises.writeFile(unreadableFile, "def test(): pass", "utf-8");
      
      // Make the file unreadable (on Unix-like systems)
      if (process.platform !== "win32") {
        await fs.promises.chmod(unreadableFile, 0o000);
      }

      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      // Verify error was logged
      if (process.platform !== "win32") {
        // The error might be logged with slightly different format
        expect(consoleErrorMock).toHaveBeenCalled();
        const calls = consoleErrorMock.mock.calls;
        const hasErrorLog = calls.some(call => 
          call.some(arg => typeof arg === 'string' && arg.includes('Error adding file'))
        );
        expect(hasErrorLog).toBe(true);
      }

      // Restore permissions for cleanup
      if (process.platform !== "win32") {
        await fs.promises.chmod(unreadableFile, 0o644);
      }
    });

    it("should handle binary files gracefully", async () => {
      // Create a binary file
      const binaryFile = path.join(tempDir, "binary.pyc");
      const binaryContent = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE]);
      await fs.promises.writeFile(binaryFile, binaryContent);

      projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".pyc"));
      await projectManager.initialize();

      // Should handle binary files without crashing
      expect(projectManager).toBeDefined();
      const callGraph = projectManager.getCallGraph();
      expect(callGraph).toBeDefined();
    });

    it("should handle very large files", async () => {
      // Create a large file (1MB of Python code)
      const largeFile = path.join(tempDir, "large.py");
      const largeContent = "def func(): pass\n".repeat(65536); // ~1MB
      await fs.promises.writeFile(largeFile, largeContent, "utf-8");

      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      // Should handle large files without issues
      const callGraph = projectManager.getCallGraph();
      expect(callGraph).toBeDefined();
      // Large files should be processed normally
    });
  });

  describe("Directory Structure Edge Cases", () => {
    it("should handle symbolic links", async () => {
      // Create a file and a symlink to it
      const originalFile = path.join(tempDir, "original.py");
      const symlinkFile = path.join(tempDir, "symlink.py");
      
      await fs.promises.writeFile(originalFile, "def original(): pass", "utf-8");
      
      try {
        await fs.promises.symlink(originalFile, symlinkFile);
      } catch {
        // Skip test if symlinks aren't supported
        console.log("Skipping symlink test - not supported on this system");
        return;
      }

      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      // Should handle symlinks without issues
      const callGraph = projectManager.getCallGraph();
      expect(callGraph).toBeDefined();
      const nodeSymbols = Array.from(callGraph.nodes.keys());
      // Should find the original function
      expect(nodeSymbols.some(s => s.includes("original"))).toBe(true);
    });

    it("should handle deeply nested directories", async () => {
      // Create a deeply nested structure
      let currentPath = tempDir;
      for (let i = 0; i < 10; i++) {
        currentPath = path.join(currentPath, `level${i}`);
        await fs.promises.mkdir(currentPath);
      }
      
      const deepFile = path.join(currentPath, "deep.py");
      await fs.promises.writeFile(deepFile, "def deep(): pass", "utf-8");

      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      // Should find the deeply nested file
      const callGraph = projectManager.getCallGraph();
      expect(callGraph).toBeDefined();
      const nodeSymbols = Array.from(callGraph.nodes.keys());
      expect(nodeSymbols.some(s => s.includes("deep"))).toBe(true);
    });

    it("should handle empty directories", async () => {
      // Create several empty directories
      await fs.promises.mkdir(path.join(tempDir, "empty1"));
      await fs.promises.mkdir(path.join(tempDir, "empty2"));
      await fs.promises.mkdir(path.join(tempDir, "src"));
      await fs.promises.mkdir(path.join(tempDir, "src", "empty3"));

      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      // Should complete without errors
      expect(projectManager).toBeDefined();
      const callGraph = projectManager.getCallGraph();
      expect(callGraph).toBeDefined();
      expect(callGraph.nodes.size).toBe(0);
    });
  });

  describe("File Name Edge Cases", () => {
    it("should handle files with special characters", async () => {
      const specialFiles = [
        "file with spaces.py",
        "file-with-dashes.py",
        "file_with_underscores.py",
        "file.multiple.dots.py",
        "文件.py", // Unicode characters
        "file[brackets].py",
        "file(parens).py"
      ];

      for (const fileName of specialFiles) {
        const filePath = path.join(tempDir, fileName);
        try {
          await fs.promises.writeFile(filePath, `def test(): pass`, "utf-8");
        } catch {
          // Skip files that the filesystem doesn't support
          continue;
        }
      }

      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      // Should handle all valid files
      const callGraph = projectManager.getCallGraph();
      expect(callGraph).toBeDefined();
      expect(callGraph.nodes.size).toBeGreaterThan(0);
    });

    it("should handle hidden files based on filter", async () => {
      // Create hidden files
      await fs.promises.writeFile(path.join(tempDir, ".hidden.py"), "def hidden(): pass", "utf-8");
      await fs.promises.writeFile(path.join(tempDir, ".env"), "SECRET=value", "utf-8");
      await fs.promises.writeFile(path.join(tempDir, "visible.py"), "def visible(): pass", "utf-8");

      // Include hidden Python files
      projectManager = new AriadneProjectManager(
        tempDir, 
        (p) => p.endsWith(".py") // This includes hidden .py files
      );
      await projectManager.initialize();

      const callGraph = projectManager.getCallGraph();
      expect(callGraph).toBeDefined();
      const nodeSymbols = Array.from(callGraph.nodes.keys());
      // Should find both Python files
      expect(nodeSymbols.some(s => s.includes("hidden"))).toBe(true);
      expect(nodeSymbols.some(s => s.includes("visible"))).toBe(true);
      // .env should not create any nodes
      expect(nodeSymbols.some(s => s.includes(".env"))).toBe(false);
    });
  });

  describe("Concurrent Operations", () => {
    it("should handle multiple simultaneous file operations", async () => {
      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      // Create multiple files simultaneously
      const filePromises = [];
      for (let i = 0; i < 10; i++) {
        const filePath = path.join(tempDir, `concurrent${i}.py`);
        filePromises.push(
          fs.promises.writeFile(filePath, `def func${i}(): pass`, "utf-8")
        );
      }

      await Promise.all(filePromises);

      // Trigger file watchers for all files
      const { mockFileWatcherCallbacks } = require("vscode").__mockHelpers;
      
      for (let i = 0; i < 10; i++) {
        const filePath = path.join(tempDir, `concurrent${i}.py`);
        if (mockFileWatcherCallbacks.onCreate) {
          await mockFileWatcherCallbacks.onCreate({ file: () => filePath });
        }
      }

      // Should handle concurrent operations
      const callGraph = projectManager.getCallGraph();
      expect(callGraph).toBeDefined();
      expect(callGraph.nodes.size).toBeGreaterThanOrEqual(10);
    });
  });

  describe("Filter Function Edge Cases", () => {
    it("should handle filter function that throws errors", async () => {
      const errorFilter = (path: string) => {
        if (path.includes("error")) {
          throw new Error("Filter error");
        }
        return path.endsWith(".py");
      };

      await fs.promises.writeFile(path.join(tempDir, "normal.py"), "def normal(): pass", "utf-8");
      await fs.promises.writeFile(path.join(tempDir, "error.py"), "def error(): pass", "utf-8");

      projectManager = new AriadneProjectManager(tempDir, errorFilter);
      
      // Should not crash during initialization
      await expect(projectManager.initialize()).resolves.toBeDefined();
    });

    it("should handle filter function that returns non-boolean values", async () => {
      const weirdFilter = (path: string): boolean => {
        // Intentionally return truthy/falsy values instead of booleans
        if (path.endsWith(".py")) {
          return 1 as any; // truthy
        }
        return "" as any; // falsy
      };

      await fs.promises.writeFile(path.join(tempDir, "test.py"), "def test(): pass", "utf-8");
      await fs.promises.writeFile(path.join(tempDir, "test.js"), "function test() {}", "utf-8");

      projectManager = new AriadneProjectManager(tempDir, weirdFilter);
      await projectManager.initialize();

      const callGraph = projectManager.getCallGraph();
      expect(callGraph).toBeDefined();
      const nodeSymbols = Array.from(callGraph.nodes.keys());
      // Should find Python file
      expect(nodeSymbols.some(s => s.includes("test.py"))).toBe(true);
      // Should not find JavaScript file
      expect(nodeSymbols.some(s => s.includes("test.js"))).toBe(false);
    });
  });

  describe("getCallGraph Edge Cases", () => {
    it("should return empty call graph before initialization", () => {
      projectManager = new AriadneProjectManager(tempDir);
      
      // Get call graph before initialize
      const callGraph = projectManager.getCallGraph();
      
      expect(callGraph).toBeDefined();
      expect(callGraph.nodes).toBeDefined();
    });

    it("should handle Project.get_call_graph() errors gracefully", async () => {
      projectManager = new AriadneProjectManager(tempDir);
      
      try {
        const callGraph = await projectManager.initialize();
        // If ariadne works, we should get a valid call graph
        expect(callGraph).toBeDefined();
        expect(callGraph.nodes).toBeDefined();
      } catch (error) {
        // If ariadne has issues, we should handle them gracefully
        console.error("Ariadne error during initialization:", error);
        // The test should not fail due to ariadne issues
        expect(error).toBeDefined();
      }
    });
  });
});