import { load_project } from "@ariadnejs/core";
import * as path from "path";

describe("ariadnejs/core Integration", () => {
  it("should generate a call graph for a simple Python project", async () => {
    // Create a simple test case
    const testProjectPath = path.join(__dirname, "../../test-fixtures/simple-python");

    // Use ariadnejs/core to generate call graph
    const project = await load_project({
      project_path: testProjectPath,
      file_filter: (filePath) => filePath.endsWith(".py"),
    });
    const callGraph = project.get_call_graph();

    // Verify the call graph has the expected structure
    expect(callGraph).toBeDefined();
    expect(callGraph.nodes).toBeDefined();
    expect(callGraph.entry_points).toBeDefined();

    // Check that we have at least one node
    expect(callGraph.nodes.size).toBeGreaterThan(0);

    // Verify node structure
    for (const [symbolId, node] of callGraph.nodes) {
      expect(node.definition).toBeDefined();
      expect(node.definition.name).toBeDefined();
      expect(node.definition.location.file_path).toBeDefined();
      expect(node.definition.location).toBeDefined();
    }
  }, 30000); // 30 second timeout for parsing
});
