import type { SymbolId } from "@ariadnejs/types";
import type { NodeRow } from "@code-charter/types";

import { build_skeleton_flows, type FlowMembership, UNATTRIBUTED_FLOW_ID } from "./flow";
import { DEFAULT_FLOW_BUDGET, project_flow, project_hydrated_flow } from "./flow_projection";
import { make_graph, type NodeSpec } from "./__fixtures__/call_graph";

function doc_node(id: string, path: string): NodeRow {
  return {
    id,
    kind: "agentic.doc",
    path,
    anchor: null,
    layer: "agentic",
    attributes: { label: id },
    field_ownership: {},
    origin: "doc-link",
    intent_source: "agentic",
    deleted_at: null,
  };
}

const graph = make_graph(
  [
    { id: "main", name: "main", file: "src/main.ts", calls: ["helper", "send"] },
    { id: "helper", name: "helper", file: "src/util.ts", calls: ["send"] },
    { id: "send", name: "send", file: "src/api.ts" },
  ],
  ["main"],
);

function main_flow() {
  return build_skeleton_flows(graph).find((f) => f.label === "main")!;
}

describe("project_flow — under budget (AC#3, AC#6)", () => {
  it("emits a code.function row per member with label + file in the adapter-ready shape", () => {
    const { nodes } = project_flow(main_flow(), graph);
    const functions = nodes.filter((n) => n.kind === "code.function");
    expect(functions.map((n) => n.attributes.label).sort()).toEqual(["helper", "main", "send"]);
    const main_node = functions.find((n) => n.id === "main")!;
    expect(main_node.path).toBe("src/main.ts");
    expect(main_node.anchor).toBeNull(); // render-only, never hashed
  });

  it("emits code.calls edges only between members, deduped", () => {
    const { edges } = project_flow(main_flow(), graph);
    const calls = edges.filter((e) => e.kind === "code.calls");
    expect(calls.map((e) => e.key).sort()).toEqual([
      "code.calls:helper->send",
      "code.calls:main->helper",
      "code.calls:main->send",
    ]);
  });

  it("folds in the file-module scaffold: one agentic.group per file with contains edges", () => {
    const { nodes, edges } = project_flow(main_flow(), graph);
    const groups = nodes.filter((n) => n.kind === "agentic.group");
    expect(groups).toHaveLength(3); // main.ts, util.ts, api.ts
    const contains = edges.filter((e) => e.kind === "agentic.contains");
    expect(contains).toHaveLength(3); // one per leaf
    // every contains edge points a real leaf -> a real emitted module
    const ids = new Set(nodes.map((n) => n.id));
    for (const edge of contains) {
      expect(ids.has(edge.src_id)).toBe(true);
      expect(ids.has(edge.dst_id)).toBe(true);
    }
  });

  it("is deterministic across runs", () => {
    expect(project_flow(main_flow(), graph)).toEqual(project_flow(main_flow(), graph));
  });

  it("marks the seed node with attributes.is_entry_point = true, non-seeds are unmarked", () => {
    const { nodes } = project_flow(main_flow(), graph);
    const main_node = nodes.find((n) => n.id === "main");
    expect(main_node?.attributes.is_entry_point).toBe(true);
    const helper_node = nodes.find((n) => n.id === "helper");
    expect(helper_node?.attributes.is_entry_point).toBeUndefined();
  });
});

describe("project_flow — over budget collapses to module granularity (AC#6, D-LARGE-FLOW-RENDER)", () => {
  // A flow with more leaves than the budget, spread across two files.
  const specs: NodeSpec[] = [{ id: "root", name: "root", file: "src/a.ts", calls: [] }];
  const calls: string[] = [];
  for (let i = 0; i < 12; i++) {
    const file = i % 2 === 0 ? "src/a.ts" : "src/b.ts";
    specs.push({ id: `n${i}`, name: `n${i}`, file, calls: i % 2 === 0 ? ["n1"] : [] });
    calls.push(`n${i}`);
  }
  specs[0].calls = calls;
  const big_graph = make_graph(specs, ["root"]);
  const tiny_budget = { max_nodes: 5, max_edges: 5 };

  it("drops leaves and renders only module groups + lifted module-to-module edges", () => {
    const flow = build_skeleton_flows(big_graph).find((f) => f.label === "root")!;
    const { nodes, edges } = project_flow(flow, big_graph, { budget: tiny_budget });
    expect(nodes.every((n) => n.kind === "agentic.group")).toBe(true);
    expect(nodes.length).toBeLessThanOrEqual(2 + 1); // a.ts, b.ts (root is in a.ts)
    // lifted edges are module->module, never self-loops
    for (const edge of edges) {
      expect(edge.kind).toBe("code.calls");
      expect(edge.src_id).not.toBe(edge.dst_id);
    }
  });

  it("stays under budget for a small flow (no collapse)", () => {
    const { nodes } = project_flow(main_flow(), graph, { budget: DEFAULT_FLOW_BUDGET });
    expect(nodes.some((n) => n.kind === "code.function")).toBe(true);
  });
});

describe("project_flow — unattributed bucket (AC#8)", () => {
  it("renders the unattributed members' subgraph", () => {
    const with_dead = make_graph(
      [
        { id: "main", name: "main", file: "m.ts" },
        { id: "orphan", name: "orphan", file: "orphan.ts", calls: ["orphan_helper"] },
        { id: "orphan_helper", name: "orphan_helper", file: "orphan.ts" },
      ],
      ["main"],
    );
    const unattributed = build_skeleton_flows(with_dead).find((f) => f.id === UNATTRIBUTED_FLOW_ID)!;
    const { nodes } = project_flow(unattributed, with_dead);
    const labels = nodes.filter((n) => n.kind === "code.function").map((n) => n.attributes.label).sort();
    expect(labels).toEqual(["orphan", "orphan_helper"]);
  });
});

describe("project_hydrated_flow (task-27.1.6)", () => {
  it("renders the code members exactly as the skeleton path does", () => {
    const membership: FlowMembership = { id: "main", seeds: ["main" as SymbolId] };
    const { nodes, edges } = project_hydrated_flow(membership, graph, []);
    const functions = nodes.filter((n) => n.kind === "code.function");
    expect(functions.map((n) => n.attributes.label).sort()).toEqual(["helper", "main", "send"]);
    expect(nodes.find((n) => n.id === "main")?.attributes.is_entry_point).toBe(true);
    const calls = edges.filter((e) => e.kind === "code.calls").map((e) => e.key).sort();
    expect(calls).toEqual(["code.calls:helper->send", "code.calls:main->helper", "code.calls:main->send"]);
  });

  it("appends doc-node rows for linked_docs that are genuine members", () => {
    const membership: FlowMembership = { id: "main", seeds: ["main" as SymbolId], linked_docs: ["doc:readme"] };
    const { nodes } = project_hydrated_flow(membership, graph, [doc_node("doc:readme", "docs/readme.md")]);
    expect(nodes.some((n) => n.id === "doc:readme" && n.kind === "agentic.doc")).toBe(true);
  });

  it("renders a docs-only flow whose members are docs, not callables", () => {
    const membership: FlowMembership = { id: "skill", seeds: [], linked_docs: ["doc:skill"] };
    const { nodes } = project_hydrated_flow(membership, graph, [doc_node("doc:skill", "skills/x.md")]);
    expect(nodes.some((n) => n.id === "doc:skill")).toBe(true);
    expect(nodes.some((n) => n.kind === "code.function")).toBe(false);
  });

  it("drops a doc node that is not a linked_doc member (stale link)", () => {
    const membership: FlowMembership = { id: "main", seeds: ["main" as SymbolId], linked_docs: ["doc:readme"] };
    const doc_nodes = [doc_node("doc:readme", "docs/readme.md"), doc_node("doc:stale", "docs/stale.md")];
    const { nodes } = project_hydrated_flow(membership, graph, doc_nodes);
    expect(nodes.some((n) => n.id === "doc:readme")).toBe(true);
    expect(nodes.some((n) => n.id === "doc:stale")).toBe(false);
  });
});
