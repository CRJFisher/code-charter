import { get_call_graph } from "@ariadnejs/core";
import * as path from "path";

describe("ariadnejs/core Integration", () => {
  it("should generate a call graph for a simple Python project", async () => {
    // Create a simple test case
    const testProjectPath = path.join(__dirname, "../../test-fixtures/simple-python");

    // Use ariadnejs/core to generate call graph
    const callGraph = await get_call_graph(testProjectPath, {
      include_external: false,
      file_filter: (filePath) => filePath.endsWith(".py"),
    });

    // Verify the call graph has the expected structure
    expect(callGraph).toBeDefined();
    expect(callGraph.nodes).toBeDefined();
    expect(callGraph.edges).toBeDefined();
    expect(callGraph.top_level_nodes).toBeDefined();

    // Check that we have at least one node
    expect(callGraph.nodes.size).toBeGreaterThan(0);

    // Verify node structure
    for (const [symbolId, node] of callGraph.nodes) {
      expect(node.definition).toBeDefined();
      expect(node.definition.name).toBeDefined();
      expect(node.definition.file_path).toBeDefined();
      expect(node.definition.range).toBeDefined();
    }
  }, 30000); // 30 second timeout for parsing
});
