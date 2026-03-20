import { Project } from "@ariadnejs/core";
import type { FilePath } from "@ariadnejs/types";
import * as path from "path";
import * as fs from "fs";

async function scan_files(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full_path = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await scan_files(full_path));
    } else if (entry.isFile()) {
      results.push(full_path);
    }
  }
  return results;
}

describe("ariadnejs/core Integration", () => {
  it("should generate a call graph for a simple Python project", async () => {
    // Create a simple test case
    const test_project_path = path.join(__dirname, "../../test-fixtures/simple-python");

    // Use ariadnejs/core to generate call graph
    const project = new Project();
    await project.initialize(test_project_path as FilePath);

    // Scan and add files manually since Project.initialize() only sets up state
    const files = await scan_files(test_project_path);
    for (const file_path of files) {
      if (file_path.endsWith(".py")) {
        const content = await fs.promises.readFile(file_path, "utf-8");
        project.update_file(file_path as FilePath, content);
      }
    }

    const call_graph = project.get_call_graph();

    // Verify the call graph has the expected structure
    expect(call_graph).toBeDefined();
    expect(call_graph.nodes).toBeDefined();
    expect(call_graph.entry_points).toBeDefined();

    // Check that we have at least one node
    expect(call_graph.nodes.size).toBeGreaterThan(0);

    // Verify node structure
    for (const [_symbol_id, node] of call_graph.nodes) {
      expect(node.definition).toBeDefined();
      expect(node.definition.name).toBeDefined();
      expect(node.definition.location.file_path).toBeDefined();
      expect(node.definition.location).toBeDefined();
    }
  }, 30000); // 30 second timeout for parsing
});
