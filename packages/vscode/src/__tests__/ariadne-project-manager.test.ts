import { AriadneProjectManager } from "../ariadne/project_manager";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("AriadneProjectManager", () => {
  let tempDir: string;
  let projectManager: AriadneProjectManager;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ariadne-test-"));
  });

  afterEach(async () => {
    // Clean up
    if (projectManager) {
      projectManager.dispose();
    }
    await fs.promises.rm(tempDir, { recursive: true });
  });

  it("should initialize with an empty project", async () => {
    projectManager = new AriadneProjectManager(tempDir);
    const callGraph = await projectManager.initialize();
    
    expect(callGraph).toBeDefined();
    expect(callGraph.nodes.size).toBe(0);
  });

  it("should scan and add Python files to the project", async () => {
    // Create a simple Python file
    const pythonFile = path.join(tempDir, "test.py");
    await fs.promises.writeFile(pythonFile, `
def hello():
    return "world"

def main():
    print(hello())
`, "utf-8");

    projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
    const callGraph = await projectManager.initialize();
    
    expect(callGraph).toBeDefined();
    expect(callGraph.nodes.size).toBeGreaterThan(0);
  });

  it("should filter files based on the provided filter", async () => {
    // Create Python and JavaScript files
    await fs.promises.writeFile(path.join(tempDir, "test.py"), "def test(): pass", "utf-8");
    await fs.promises.writeFile(path.join(tempDir, "test.js"), "function test() {}", "utf-8");

    // Only include Python files
    projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
    const callGraph = await projectManager.initialize();
    
    // Should only have nodes from Python file
    const nodeSymbols = Array.from(callGraph.nodes.keys());
    expect(nodeSymbols.some(s => s.includes("test.py"))).toBe(true);
    expect(nodeSymbols.some(s => s.includes("test.js"))).toBe(false);
  });

  it("should skip common non-source directories", async () => {
    // Create directories that should be skipped
    const nodeModulesDir = path.join(tempDir, "node_modules");
    await fs.promises.mkdir(nodeModulesDir);
    await fs.promises.writeFile(
      path.join(nodeModulesDir, "test.py"), 
      "def should_not_be_included(): pass", 
      "utf-8"
    );

    // Create a file that should be included
    await fs.promises.writeFile(
      path.join(tempDir, "included.py"), 
      "def should_be_included(): pass", 
      "utf-8"
    );

    projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
    const callGraph = await projectManager.initialize();
    
    const nodeSymbols = Array.from(callGraph.nodes.keys());
    expect(nodeSymbols.some(s => s.includes("included.py"))).toBe(true);
    expect(nodeSymbols.some(s => s.includes("node_modules"))).toBe(false);
  });

  it("should handle nested directories", async () => {
    // Create nested structure
    const srcDir = path.join(tempDir, "src");
    const libDir = path.join(srcDir, "lib");
    await fs.promises.mkdir(srcDir);
    await fs.promises.mkdir(libDir);
    
    await fs.promises.writeFile(
      path.join(srcDir, "main.py"), 
      "def main(): pass", 
      "utf-8"
    );
    await fs.promises.writeFile(
      path.join(libDir, "utils.py"), 
      "def util(): pass", 
      "utf-8"
    );

    projectManager = new AriadneProjectManager(tempDir, (p) => p.endsWith(".py"));
    const callGraph = await projectManager.initialize();
    
    const nodeSymbols = Array.from(callGraph.nodes.keys());
    expect(nodeSymbols.some(s => s.includes("main.py"))).toBe(true);
    expect(nodeSymbols.some(s => s.includes("utils.py"))).toBe(true);
  });
});