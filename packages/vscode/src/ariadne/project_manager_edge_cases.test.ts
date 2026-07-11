import { AriadneProjectManager } from "./project_manager";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const originalConsoleError = console.error;
const originalConsoleLog = console.log;

describe("AriadneProjectManager - Edge Cases and Error Handling", () => {
  let tempDir: string;
  let projectManager: AriadneProjectManager;

  beforeEach(async () => {
    // The tests here deliberately trigger filter/parse errors that the manager logs;
    // swap console for jest mocks so that expected noise stays out of the test output.
    console.error = jest.fn();
    console.log = jest.fn();

    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ariadne-edge-test-"));
  });

  afterEach(async () => {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;

    if (projectManager) {
      projectManager.dispose();
    }
    try {
      await fs.promises.rm(tempDir, { recursive: true });
    } catch {
      // Cleanup is best-effort; a failure here must not mask the test result.
    }
  });

  describe("File Reading Errors", () => {
    it("handles binary files gracefully", async () => {
      const binaryFile = path.join(tempDir, "binary.pyc");
      const binaryContent = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE]);
      await fs.promises.writeFile(binaryFile, binaryContent);

      projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".pyc"));
      await projectManager.initialize();

      expect(projectManager).toBeDefined();
      const callGraph = projectManager.get_call_graph();
      expect(callGraph).toBeDefined();
    });

    it("handles very large files", async () => {
      const largeFile = path.join(tempDir, "large.py");
      const largeContent = "def func(): pass\n".repeat(65536);
      await fs.promises.writeFile(largeFile, largeContent, "utf-8");

      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      const callGraph = projectManager.get_call_graph();
      expect(callGraph).toBeDefined();
    });
  });

  describe("Directory Structure Edge Cases", () => {
    it("handles symbolic links", async () => {
      const originalFile = path.join(tempDir, "original.py");
      const symlinkFile = path.join(tempDir, "symlink.py");

      await fs.promises.writeFile(originalFile, "def original(): pass", "utf-8");

      try {
        await fs.promises.symlink(originalFile, symlinkFile);
      } catch {
        return;
      }

      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      const callGraph = projectManager.get_call_graph();
      expect(callGraph).toBeDefined();
      const nodeSymbols = Array.from(callGraph.nodes.keys());
      expect(nodeSymbols.some(s => s.includes("original"))).toBe(true);
    });

    it("handles deeply nested directories", async () => {
      let currentPath = tempDir;
      for (let i = 0; i < 10; i++) {
        currentPath = path.join(currentPath, `level${i}`);
        await fs.promises.mkdir(currentPath);
      }

      const deepFile = path.join(currentPath, "deep.py");
      await fs.promises.writeFile(deepFile, "def deep(): pass", "utf-8");

      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      const callGraph = projectManager.get_call_graph();
      expect(callGraph).toBeDefined();
      const nodeSymbols = Array.from(callGraph.nodes.keys());
      expect(nodeSymbols.some(s => s.includes("deep"))).toBe(true);
    });

    it("handles empty directories", async () => {
      await fs.promises.mkdir(path.join(tempDir, "empty1"));
      await fs.promises.mkdir(path.join(tempDir, "empty2"));
      await fs.promises.mkdir(path.join(tempDir, "src"));
      await fs.promises.mkdir(path.join(tempDir, "src", "empty3"));

      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      expect(projectManager).toBeDefined();
      const callGraph = projectManager.get_call_graph();
      expect(callGraph).toBeDefined();
      expect(callGraph.nodes.size).toBe(0);
    });
  });

  describe("File Name Edge Cases", () => {
    it("handles files with special characters", async () => {
      const specialFiles = [
        "file with spaces.py",
        "file-with-dashes.py",
        "file_with_underscores.py",
        "file.multiple.dots.py",
        "文件.py",
        "file[brackets].py",
        "file(parens).py"
      ];

      for (const fileName of specialFiles) {
        const filePath = path.join(tempDir, fileName);
        try {
          await fs.promises.writeFile(filePath, `def test(): pass`, "utf-8");
        } catch {
          continue;
        }
      }

      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      const callGraph = projectManager.get_call_graph();
      expect(callGraph).toBeDefined();
      expect(callGraph.nodes.size).toBeGreaterThan(0);
    });

    it("indexes hidden files that pass the filter and ignores non-source hidden files", async () => {
      await fs.promises.writeFile(path.join(tempDir, ".hidden.py"), "def hidden(): pass", "utf-8");
      await fs.promises.writeFile(path.join(tempDir, ".env"), "SECRET=value", "utf-8");
      await fs.promises.writeFile(path.join(tempDir, "visible.py"), "def visible(): pass", "utf-8");

      projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
      await projectManager.initialize();

      const callGraph = projectManager.get_call_graph();
      expect(callGraph).toBeDefined();
      const nodeSymbols = Array.from(callGraph.nodes.keys());
      expect(nodeSymbols.some(s => s.includes("hidden"))).toBe(true);
      expect(nodeSymbols.some(s => s.includes("visible"))).toBe(true);
      expect(nodeSymbols.some(s => s.includes(".env"))).toBe(false);
    });
  });

  describe("Filter Function Edge Cases", () => {
    it("keeps scanning when the filter throws on a file", async () => {
      const errorFilter = (path: string) => {
        if (path.includes("error")) {
          throw new Error("Filter error");
        }
        return path.endsWith(".py");
      };

      await fs.promises.writeFile(path.join(tempDir, "normal.py"), "def normal(): pass", "utf-8");
      await fs.promises.writeFile(path.join(tempDir, "error.py"), "def error(): pass", "utf-8");

      projectManager = new AriadneProjectManager(tempDir, errorFilter);

      const callGraph = await projectManager.initialize();
      const nodeSymbols = Array.from(callGraph.nodes.keys());
      expect(nodeSymbols.some(s => s.includes("normal.py"))).toBe(true);
      expect(nodeSymbols.some(s => s.includes("error.py"))).toBe(false);
    });
  });

  describe("get_call_graph before initialization", () => {
    it("returns an empty call graph before initialization", () => {
      projectManager = new AriadneProjectManager(tempDir);

      const callGraph = projectManager.get_call_graph();

      expect(callGraph.nodes.size).toBe(0);
      expect(callGraph.entry_points).toEqual([]);
    });
  });
});
