import type { EdgeRow, NodeRow } from "@code-charter/types";

import { is_code_node, is_module_node } from "./chart_types";
import { CONFIG } from "./chart_config";
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
    expect(rendered_leaf.expandParent).toBe(true);
    expect(rendered_leaf.extent).toEqual([[-1e9, CONFIG.layout.module.headerHeight], [1e9, 1e9]]);
    const rendered_module = nodes.find((n) => n.id === MODULE_ID)!;
    if (is_module_node(rendered_module)) {
      expect(rendered_module.data.member_count).toBe(1);
    }
    // the containment edge is structural, expressed via parentId — never drawn
    expect(edges).toHaveLength(0);
  });

  it("leaves a leaf's parentId unset when its containing module is not emitted", () => {
    const leaf = node();
    const unregistered_module = node({ id: MODULE_ID, kind: "doc.markdown", anchor: null });
    const contains = edge({ key: "c1", src_id: leaf.id, dst_id: MODULE_ID, kind: "agentic.contains", layer: "agentic" });

    const { nodes } = custom_graph_to_react_flow({ nodes: [leaf, unregistered_module], edges: [contains] });

    const rendered_leaf = nodes.find((n) => n.id === leaf.id)!;
    expect(rendered_leaf.parentId).toBeUndefined();
    expect(rendered_leaf.extent).toBeUndefined();
    expect(rendered_leaf.expandParent).toBeUndefined();
  });

  it("reads line_number from attributes, falling back to 1 when absent", () => {
    const with_line = node({ id: "src/app.ts#a:function", attributes: { line_number: 42 } });
    const without_line = node({ id: "src/app.ts#b:function" });
    const { nodes } = custom_graph_to_react_flow({ nodes: [with_line, without_line], edges: [] });
    const a = nodes.find((n) => n.id === with_line.id)!;
    const b = nodes.find((n) => n.id === without_line.id)!;
    expect(is_code_node(a)).toBe(true);
    if (is_code_node(a)) expect(a.data.line_number).toBe(42);
    if (is_code_node(b)) expect(b.data.line_number).toBe(1);
  });

  it("sets data.is_entry_point when the row has attributes.is_entry_point = true (AC#4)", () => {
    const entry = node({ attributes: { is_entry_point: true } });
    const non_entry = node({ id: "src/app.ts#helper:function" });
    const { nodes } = custom_graph_to_react_flow({ nodes: [entry, non_entry], edges: [] });
    const entry_node = nodes.find((n) => n.id === entry.id)!;
    const other_node = nodes.find((n) => n.id === non_entry.id)!;
    expect(is_code_node(entry_node)).toBe(true);
    if (is_code_node(entry_node)) expect(entry_node.data.is_entry_point).toBe(true);
    if (is_code_node(other_node)) expect(other_node.data.is_entry_point).toBe(false);
  });

  it("assigns distinct cluster_index per module group node in emission order (AC#5)", () => {
    const module_a = node({ id: "agentic.group:file:src/a.ts", kind: "agentic.group", anchor: null, layer: "agentic", attributes: { label: "src/a.ts" } });
    const module_b = node({ id: "agentic.group:file:src/b.ts", kind: "agentic.group", anchor: null, layer: "agentic", attributes: { label: "src/b.ts" } });
    const { nodes } = custom_graph_to_react_flow({ nodes: [module_a, module_b], edges: [] });
    const rendered_a = nodes.find((n) => n.id === module_a.id)!;
    const rendered_b = nodes.find((n) => n.id === module_b.id)!;
    expect(is_module_node(rendered_a)).toBe(true);
    expect(is_module_node(rendered_b)).toBe(true);
    if (is_module_node(rendered_a) && is_module_node(rendered_b)) {
      expect(rendered_a.data.cluster_index).toBe(0);
      expect(rendered_b.data.cluster_index).toBe(1);
    }
  });

  it("emits every parent before its children, even for children-first input rows (AC#2)", () => {
    // Two modules, each with a leaf. Input order is children-first (as flow_projection emits them):
    // both leaves, then both module groups. The adapter must reorder so each parent precedes its child.
    const leaf_a = node({ id: "src/a.ts#fn:function", path: "src/a.ts" });
    const leaf_b = node({ id: "src/b.ts#fn:function", path: "src/b.ts" });
    const module_a = node({ id: "agentic.group:file:src/a.ts", kind: "agentic.group", anchor: null, layer: "agentic", attributes: { label: "src/a.ts" } });
    const module_b = node({ id: "agentic.group:file:src/b.ts", kind: "agentic.group", anchor: null, layer: "agentic", attributes: { label: "src/b.ts" } });
    const contains_a = edge({ key: "c1", src_id: leaf_a.id, dst_id: module_a.id, kind: "agentic.contains", layer: "agentic" });
    const contains_b = edge({ key: "c2", src_id: leaf_b.id, dst_id: module_b.id, kind: "agentic.contains", layer: "agentic" });

    const { nodes } = custom_graph_to_react_flow({
      nodes: [leaf_a, leaf_b, module_a, module_b],
      edges: [contains_a, contains_b],
    });

    const index_of = new Map(nodes.map((n, i) => [n.id, i]));
    for (const child of nodes) {
      if (child.parentId === undefined) continue;
      expect(index_of.get(child.parentId)!).toBeLessThan(index_of.get(child.id)!);
    }
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
