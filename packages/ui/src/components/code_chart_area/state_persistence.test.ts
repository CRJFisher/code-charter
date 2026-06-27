import { export_graph_state } from "./state_persistence";
import * as state_persistence from "./state_persistence";
import { Viewport } from "@xyflow/react";
import { CodeChartNode, CodeChartEdge } from "./chart_types";

describe("state_persistence", () => {
  // task-29.3 regression. The live defect restored a stale layout snapshot from localStorage on mount
  // and returned before the layout pipeline ran, replaying a broken layout (modules at {0,0}, no
  // dimensions) forever. The fix removed that path: persistence is file-only, with no localStorage
  // load/save/clear primitive. Re-introducing any of those re-enables the restore-bypass, so guard
  // their absence here — this is the test that fails if the root cause regresses.
  describe("no layout auto-restore surface (task-29.3 regression)", () => {
    it.each(["load_graph_state", "save_graph_state", "clear_graph_state"])(
      "does not expose %s (a localStorage restore/persist primitive)",
      (name) => {
        expect(name in state_persistence).toBe(false);
      },
    );
  });

  const mock_nodes: CodeChartNode[] = [
    {
      id: "node1",
      position: { x: 100, y: 100 },
      type: "code_function",
      data: {
        function_name: "Node 1",
        description: "",
        file_path: "/test/n1.ts",
        line_number: 1,
        symbol: "test::n1",
      },
    },
    {
      id: "node2",
      position: { x: 200, y: 200 },
      type: "code_function",
      data: {
        function_name: "Node 2",
        description: "",
        file_path: "/test/n2.ts",
        line_number: 1,
        symbol: "test::n2",
      },
    },
  ];

  const mock_edges: CodeChartEdge[] = [
    {
      id: "edge1",
      source: "node1",
      target: "node2",
    },
  ];

  const mock_viewport: Viewport = {
    x: 50,
    y: 50,
    zoom: 1.5,
  };

  const entry_point = "test::main";

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe("export_graph_state", () => {
    // Returns a real anchor and routes document.createElement to it so attribute
    // writes and the click can be inspected without a double-cast on a partial stub.
    function stub_anchor() {
      const element = document.createElement("a");
      const set_attribute = jest.spyOn(element, "setAttribute");
      const click = jest.spyOn(element, "click").mockImplementation(() => {});
      jest.spyOn(document, "createElement").mockReturnValue(element);
      return { set_attribute, click };
    }

    it("encodes the full graph state into the download href", () => {
      const { set_attribute } = stub_anchor();

      export_graph_state(mock_nodes, mock_edges, mock_viewport, entry_point);

      const prefix = "data:application/json;charset=utf-8,";
      const href_call = set_attribute.mock.calls.find((call) => call[0] === "href");
      const href = href_call?.[1] ?? "";
      expect(href.startsWith(prefix)).toBe(true);

      const parsed = JSON.parse(decodeURIComponent(href.slice(prefix.length)));
      expect(parsed.nodes).toEqual(mock_nodes);
      expect(parsed.edges).toEqual(mock_edges);
      expect(parsed.viewport).toEqual(mock_viewport);
      expect(parsed.entry_point).toBe(entry_point);
      expect(typeof parsed.timestamp).toBe("number");
    });

    it("clicks a download link named after the sanitized entry point", () => {
      const { set_attribute, click } = stub_anchor();

      export_graph_state(mock_nodes, mock_edges, mock_viewport, "test::func/with<>special*chars");

      const download_call = set_attribute.mock.calls.find((call) => call[0] === "download");
      expect(download_call?.[1]).toMatch(/^code-graph-test__func_with__special_chars-\d+\.json$/);
      expect(click).toHaveBeenCalledTimes(1);
    });
  });
});
