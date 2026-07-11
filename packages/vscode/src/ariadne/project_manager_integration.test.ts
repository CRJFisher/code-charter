import { AriadneProjectManager } from "./project_manager";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";

const vscodeMock = require("vscode");
const { mockFileWatcherCallbacks, mockDocumentChangeCallback, mockEventEmitter } = vscodeMock.__mockHelpers;

describe("AriadneProjectManager - Integration Tests", () => {
  let tempDir: string;
  let projectManager: AriadneProjectManager;

  beforeEach(async () => {
    if (mockEventEmitter.instance) {
      mockEventEmitter.instance.fire.mockClear();
    }

    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ariadne-integration-"));

    const srcDir = path.join(tempDir, "src");
    const testDir = path.join(tempDir, "tests");
    const libDir = path.join(srcDir, "lib");

    await fs.promises.mkdir(srcDir);
    await fs.promises.mkdir(testDir);
    await fs.promises.mkdir(libDir);

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
    it("reindexes on file creation and document edits across a development session", async () => {
      const callGraphUpdates: Array<{ nodeCount: number; nodes: string[] }> = [];

      projectManager = new AriadneProjectManager(tempDir, (p) => {
        return p.endsWith(".py") && !p.includes("test");
      });

      projectManager.on_call_graph_changed((graph) => {
        callGraphUpdates.push({
          nodeCount: graph.nodes.size,
          nodes: Array.from(graph.nodes.keys())
        });
      });

      const initialGraph = await projectManager.initialize();

      expect(initialGraph.nodes.size).toBeGreaterThan(0);
      const nodeSymbols = Array.from(initialGraph.nodes.keys());
      expect(nodeSymbols.some(s => s.includes("main.py"))).toBe(true);
      expect(nodeSymbols.some(s => s.includes("utils.py"))).toBe(true);
      expect(nodeSymbols.some(s => s.includes("test_main.py"))).toBe(false);

      const featurePath = path.join(tempDir, "src", "feature.py");
      await fs.promises.writeFile(
        featurePath,
        `def new_feature():
    return "awesome"

def feature_helper():
    pass`,
        "utf-8"
      );

      await mockFileWatcherCallbacks.onCreate(vscode.Uri.file(featurePath));

      await new Promise(resolve => setTimeout(resolve, 600));

      expect(callGraphUpdates.length).toBeGreaterThan(0);
      const lastUpdate = callGraphUpdates[callGraphUpdates.length - 1];
      expect(lastUpdate.nodeCount).toBeGreaterThan(initialGraph.nodes.size);

      const mainPath = path.join(tempDir, "src", "main.py");
      const updatedMainContent = `def main():
    print("Hello World")
    utils.helper()
    new_feature()

def secondary():
    return 42

def new_function():
    return "new"`;

      await fs.promises.writeFile(mainPath, updatedMainContent, "utf-8");

      const mockDocument = {
        uri: vscode.Uri.file(mainPath),
        getText: () => updatedMainContent
      };

      await mockDocumentChangeCallback.callback({
        document: mockDocument,
        contentChanges: []
      });

      await new Promise(resolve => setTimeout(resolve, 600));

      const finalUpdate = callGraphUpdates[callGraphUpdates.length - 1];
      expect(finalUpdate.nodeCount).toBeGreaterThan(0);
      expect(finalUpdate.nodes.some(s => s.includes("main.py"))).toBe(true);
    });

    it("debounces a rapid editing session into a single update", async () => {
      jest.useFakeTimers();

      projectManager = new AriadneProjectManager(tempDir);
      await projectManager.initialize();

      const filePath = path.join(tempDir, "src", "rapid.py");
      let updateCount = 0;

      projectManager.on_call_graph_changed(() => {
        updateCount++;
      });

      for (let i = 0; i < 10; i++) {
        const content = `def func():
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

        jest.advanceTimersByTime(100);
      }

      expect(updateCount).toBe(0);

      jest.advanceTimersByTime(500);

      expect(updateCount).toBe(1);

      jest.useRealTimers();
    });
  });

  describe("Performance Characteristics", () => {
    it("indexes many files and applies incremental updates faster than a full scan", async () => {
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

      expect(initTime).toBeLessThan(5000);
      expect(graph.nodes.size).toBeGreaterThan(0);

      const updateStartTime = Date.now();
      const newFilePath = path.join(tempDir, "new_file.py");
      await fs.promises.writeFile(newFilePath, "def new_func(): pass", "utf-8");
      await mockFileWatcherCallbacks.onCreate(vscode.Uri.file(newFilePath));
      const updateTime = Date.now() - updateStartTime;

      expect(updateTime).toBeLessThan(initTime / 10);
    });
  });
});
