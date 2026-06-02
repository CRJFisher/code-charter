import type { EdgeRow, NodeRow } from "@code-charter/types";

import { is_code_node, is_module_node } from "./chart_types";
import { custom_graph_to_react_flow } from "./custom_graph_to_react_flow";

function node(over: Partial<NodeRow> = {}): NodeRow {
  return {
    id: "src/app.ts#calculate:function",
    kind: "code.function",
    path: "src/app.ts",
    anchor: "src/app.ts#calculate:function:" + "a".repeat(64),
    layer: "raw",
    attributes: {},
    field_ownership: {},
    origin: "ariadne",
    intent_source: "code-edit",
    deleted_at: null,
    ...over,
  };
}

function edge(over: Partial<EdgeRow> = {}): EdgeRow {
  return {
    key: "e1",
    src_id: "a",
    dst_id: "b",
    kind: "code.calls",
    confidence: 1,
    layer: "raw",
    attributes: {},
    field_ownership: {},
    origin: "ariadne",
    intent_source: "code-edit",
    adjudication: null,
    deleted_at: null,
    ...over,
  };
}

const MODULE_ID = "agentic.group:file:src/app.ts";

describe("custom_graph_to_react_flow (AC#6)", () => {
  it("renders a code.function leaf, mapping attributes.description to the label", () => {
    const { nodes } = custom_graph_to_react_flow({
      nodes: [node({ attributes: { description: "adds two numbers" } })],
      edges: [],
    });
    expect(nodes).toHaveLength(1);
    const leaf = nodes[0];
    expect(leaf.type).toBe("code_function");
    expect(is_code_node(leaf)).toBe(true);
    if (is_code_node(leaf)) {
      expect(leaf.data.description).toBe("adds two numbers");
      expect(leaf.data.function_name).toBe("calculate");
      expect(leaf.data.file_path).toBe("src/app.ts");
      expect(leaf.data.symbol).toBe("src/app.ts#calculate:function");
    }
  });

  it("resolves node type from kind via the open registry (agentic.group -> module_group)", () => {
    const { nodes } = custom_graph_to_react_flow({
      nodes: [node({ id: MODULE_ID, kind: "agentic.group", anchor: null, layer: "agentic", attributes: { label: "src/app.ts" } })],
      edges: [],
    });
    expect(nodes[0].type).toBe("module_group");
    expect(is_module_node(nodes[0])).toBe(true);
  });

  it("renders the file-module tier: a contains edge becomes the leaf's parentId and is not drawn", () => {
    const leaf = node();
    const module = node({ id: MODULE_ID, kind: "agentic.group", anchor: null, layer: "agentic", attributes: { label: "src/app.ts" } });
    const contains = edge({ key: "c1", src_id: leaf.id, dst_id: MODULE_ID, kind: "agentic.contains", layer: "agentic" });

    const { nodes, edges } = custom_graph_to_react_flow({ nodes: [leaf, module], edges: [contains] });

    const rendered_leaf = nodes.find((n) => n.id === leaf.id)!;
    expect(rendered_leaf.parentId).toBe(MODULE_ID);
    expect(rendered_leaf.extent).toBe("parent");
    const rendered_module = nodes.find((n) => n.id === MODULE_ID)!;
    if (is_module_node(rendered_module)) {
      expect(rendered_module.data.member_count).toBe(1);
    }
    // the containment edge is structural, expressed via parentId — never drawn
    expect(edges).toHaveLength(0);
  });

  it("skips a node whose kind has no registered component, without throwing", () => {
    const { nodes } = custom_graph_to_react_flow({
      nodes: [node(), node({ id: "doc#1", kind: "doc.markdown", anchor: null })],
      edges: [],
    });
    expect(nodes.map((n) => n.id)).toEqual(["src/app.ts#calculate:function"]);
  });

  it("drops a drawn edge whose endpoint was not emitted (dangling)", () => {
    const { edges } = custom_graph_to_react_flow({
      nodes: [node({ id: "a", kind: "code.function" })],
      edges: [edge({ key: "e1", src_id: "a", dst_id: "gone", kind: "code.calls" })],
    });
    expect(edges).toHaveLength(0);
  });

  it("carries the source row on data.row for nodes and drawn edges (selection-driven provenance)", () => {
    const a = node({ id: "a" });
    const b = node({ id: "b" });
    const calls = edge({ key: "e1", src_id: "a", dst_id: "b", kind: "code.calls" });
    const { nodes, edges } = custom_graph_to_react_flow({ nodes: [a, b], edges: [calls] });
    expect(nodes[0].data.row).toEqual(a);
    expect(edges[0].data?.row).toEqual(calls);
  });
});
