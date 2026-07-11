import type { SymbolId } from "@ariadnejs/types";
import type { EdgeRow, FlowSummary } from "@code-charter/types";

import {
  BRIDGE_EDGE_KIND,
  build_flow_member_edges,
  build_flow_node,
  build_skeleton_flows,
  build_symbol_path_index,
  collect_persisted_flow,
  FLOW_MEMBER_EDGE_KIND,
  FLOW_NODE_KIND,
  flow_id_of,
  flow_of_leaf,
  hydrated_seed_paths,
  induce_members,
  order_flows,
  paths_of,
  reachable_from,
  read_hydrated_flows,
  reconstruct_flow_membership,
  skeleton_to_summary,
  UNATTRIBUTED_FLOW_ID,
} from "./flow";
import { make_graph, make_node } from "./__fixtures__/call_graph";

describe("flow_id_of", () => {
  it("is the dominant seed's symbol_path: file#name:kind, body-independent", () => {
    const node = make_node({ id: "main.ts:main:5", name: "main", file: "src/main.ts", line: 5 });
    expect(flow_id_of(node)).toBe("src/main.ts#main:function");
  });

  it("does not change when the line number shifts (no location in the id)", () => {
    const a = make_node({ id: "main.ts:main:5", name: "main", file: "src/main.ts", line: 5 });
    const b = make_node({ id: "main.ts:main:9", name: "main", file: "src/main.ts", line: 9 });
    expect(flow_id_of(a)).toBe(flow_id_of(b));
  });
});

describe("reachable_from", () => {
  it("collects the transitive callees, terminating on cycles", () => {
    const graph = make_graph(
      [
        { id: "a", name: "a", file: "f.ts", calls: ["b"] },
        { id: "b", name: "b", file: "f.ts", calls: ["c"] },
        { id: "c", name: "c", file: "f.ts", calls: ["a"] }, // cycle back to a
      ],
      ["a"],
    );
    expect([...reachable_from("a" as SymbolId, graph)].sort()).toEqual(["a", "b", "c"]);
  });

  it("skips resolutions whose target is not a node (external/unresolved)", () => {
    const graph = make_graph([{ id: "a", name: "a", file: "f.ts", calls: ["external"] }], ["a"]);
    expect([...reachable_from("a" as SymbolId, graph)]).toEqual(["a"]);
  });
});

describe("build_skeleton_flows", () => {
  const graph = make_graph(
    [
      { id: "main", name: "main", file: "src/main.ts", calls: ["helper", "shared"] },
      { id: "helper", name: "helper", file: "src/helper.ts" },
      { id: "shared", name: "shared", file: "src/shared.ts" },
      { id: "cli", name: "cli", file: "src/cli.ts", calls: ["shared"] },
      { id: "dead", name: "dead", file: "src/dead.ts" }, // reachable from no entrypoint
    ],
    ["main", "cli"],
  );

  it("emits one flow per top-level entrypoint, larger reachable subgraph first", () => {
    const flows = build_skeleton_flows(graph).filter((f) => !f.is_unattributed);
    expect(flows.map((f) => f.label)).toEqual(["main", "cli"]);
    expect(flows[0].member_count).toBe(3); // main + helper + shared
    expect(flows[1].member_count).toBe(2); // cli + shared
  });

  it("a shared callee is induced into both flows (membership is not a partition)", () => {
    const flows = build_skeleton_flows(graph).filter((f) => !f.is_unattributed);
    for (const flow of flows) {
      expect(induce_members(flow, graph).has("shared" as SymbolId)).toBe(true);
    }
  });

  it("buckets code reachable from no entrypoint into a single unattributed flow, always last", () => {
    const flows = build_skeleton_flows(graph);
    const last = flows[flows.length - 1];
    expect(last.id).toBe(UNATTRIBUTED_FLOW_ID);
    expect(last.is_unattributed).toBe(true);
    expect(last.seeds).toEqual(["dead"]);
  });

  it("emits no unattributed flow when every node is reachable", () => {
    const all_reachable = make_graph(
      [
        { id: "main", name: "main", file: "m.ts", calls: ["a"] },
        { id: "a", name: "a", file: "a.ts" },
      ],
      ["main"],
    );
    expect(build_skeleton_flows(all_reachable).some((f) => f.is_unattributed)).toBe(false);
  });

  it("is deterministic regardless of node insertion order", () => {
    const reversed = make_graph(
      [
        { id: "dead", name: "dead", file: "src/dead.ts" },
        { id: "shared", name: "shared", file: "src/shared.ts" },
        { id: "cli", name: "cli", file: "src/cli.ts", calls: ["shared"] },
        { id: "helper", name: "helper", file: "src/helper.ts" },
        { id: "main", name: "main", file: "src/main.ts", calls: ["helper", "shared"] },
      ],
      ["cli", "main"],
    );
    expect(build_skeleton_flows(reversed)).toEqual(build_skeleton_flows(graph));
  });
});

describe("flow_of_leaf", () => {
  it("returns every flow whose induced subgraph contains the leaf", () => {
    const graph = make_graph(
      [
        { id: "main", name: "main", file: "m.ts", calls: ["shared"] },
        { id: "cli", name: "cli", file: "c.ts", calls: ["shared"] },
        { id: "shared", name: "shared", file: "s.ts" },
      ],
      ["main", "cli"],
    );
    const flows = build_skeleton_flows(graph);
    expect(flow_of_leaf("shared" as SymbolId, flows, graph).sort()).toEqual(
      ["c.ts#cli:function", "m.ts#main:function"].sort(),
    );
  });
});

describe("paths_of", () => {
  const graph = make_graph(
    [
      { id: "main", name: "main", file: "src/main.ts" },
      { id: "helper", name: "helper", file: "src/helper.ts" },
    ],
    ["main"],
  );

  it("maps symbol ids to sorted symbol_paths, dropping ids absent from the graph", () => {
    const paths = paths_of(new Set(["helper", "main", "ghost"] as SymbolId[]), graph);
    expect(paths).toEqual(["src/helper.ts#helper:function", "src/main.ts#main:function"]);
  });

  it("dedupes two ids that collapse to one symbol_path", () => {
    const collapsing = make_graph(
      [
        { id: "run#1", name: "run", file: "svc.ts" },
        { id: "run#2", name: "run", file: "svc.ts" },
      ],
      [],
    );
    expect(paths_of(new Set(["run#1", "run#2"] as SymbolId[]), collapsing)).toEqual(["svc.ts#run:function"]);
  });
});

describe("build_symbol_path_index", () => {
  it("maps each symbol_path back to its symbol id (the inverse of flow_id_of)", () => {
    const graph = make_graph([{ id: "main", name: "main", file: "src/main.ts" }], ["main"]);
    expect(build_symbol_path_index(graph).get("src/main.ts#main:function")).toBe("main");
  });

  it("keeps the first id in sorted order when two ids collapse to one symbol_path", () => {
    const graph = make_graph(
      [
        { id: "run#2", name: "run", file: "svc.ts" },
        { id: "run#1", name: "run", file: "svc.ts" },
      ],
      [],
    );
    expect(build_symbol_path_index(graph).get("svc.ts#run:function")).toBe("run#1");
  });
});

describe("induce_members bridges + linked docs", () => {
  const graph = make_graph(
    [
      { id: "a", name: "a", file: "a.ts", calls: ["a_helper"] },
      { id: "a_helper", name: "a_helper", file: "a.ts" },
      { id: "b", name: "b", file: "b.ts", calls: ["b_helper"] },
      { id: "b_helper", name: "b_helper", file: "b.ts" },
    ],
    ["a"],
  );

  it("pulls a bridged tree's reachable interior into the member set", () => {
    const seeds_only = induce_members({ id: "f", seeds: ["a" as SymbolId] }, graph);
    expect(seeds_only.has("b" as SymbolId)).toBe(false);

    const with_bridge = induce_members(
      { id: "f", seeds: ["a" as SymbolId], bridges: [{ src_id: "a", dst_id: "b" }] },
      graph,
    );
    expect([...with_bridge].sort()).toEqual(["a", "a_helper", "b", "b_helper"]);
  });

  it("adds linked docs as members", () => {
    const members = induce_members(
      { id: "f", seeds: ["a" as SymbolId], linked_docs: ["docs/readme.md"] },
      graph,
    );
    expect(members.has("docs/readme.md" as SymbolId)).toBe(true);
  });
});

describe("build_skeleton_flows id de-duplication (D-FLOW-IDENTITY edge)", () => {
  it("collapses two entrypoints that derive the same id into one selector entry", () => {
    // Two methods named `run` in different classes both flatten to `svc.ts#run:function` under the
    // v1 enclosing-free symbol_path, so they share an id; only one flow should be emitted.
    const graph = make_graph(
      [
        { id: "run#1", name: "run", file: "svc.ts" },
        { id: "run#2", name: "run", file: "svc.ts" },
      ],
      ["run#1", "run#2"],
    );
    const ids = build_skeleton_flows(graph).map((f) => f.id);
    expect(ids).toEqual(["svc.ts#run:function"]);
  });
});

describe("order_flows", () => {
  const skeleton: FlowSummary[] = [
    summary({ id: "m.ts#main:function", member_count: 5 }),
    summary({ id: "c.ts#cli:function", member_count: 2 }),
  ];

  it("puts hydrated flows first, most-recently-synced first, then the skeleton", () => {
    const hydrated: FlowSummary[] = [
      summary({ id: "h1", is_hydrated: true, last_synced_at: "2026-06-01T00:00:00Z" }),
      summary({ id: "h2", is_hydrated: true, last_synced_at: "2026-06-02T00:00:00Z" }),
    ];
    expect(order_flows(hydrated, skeleton, new Set()).map((f) => f.id)).toEqual([
      "h2",
      "h1",
      "m.ts#main:function",
      "c.ts#cli:function",
    ]);
  });

  it("drops a skeleton flow whose id is already hydrated (the hydrated entry supersedes it)", () => {
    const hydrated: FlowSummary[] = [
      summary({ id: "m.ts#main:function", is_hydrated: true, last_synced_at: "2026-06-01T00:00:00Z" }),
    ];
    const ordered = order_flows(hydrated, skeleton, new Set());
    expect(ordered.filter((f) => f.id === "m.ts#main:function")).toHaveLength(1);
    expect(ordered[0].is_hydrated).toBe(true);
  });

  it("drops a skeleton flow a grouped flow folded in as a non-dominant seed (claimed_paths)", () => {
    // A hydrated grouped flow's id is only its dominant seed; `c.ts#cli:function` is a second seed it
    // claimed. Without claimed-path suppression it would re-surface as a duplicate bare skeleton entry.
    const hydrated: FlowSummary[] = [
      summary({ id: "grp.ts#run:function", is_hydrated: true, last_synced_at: "2026-06-01T00:00:00Z" }),
    ];
    const ordered = order_flows(hydrated, skeleton, new Set(["c.ts#cli:function"]));
    expect(ordered.map((f) => f.id)).toEqual(["grp.ts#run:function", "m.ts#main:function"]);
  });

  it("with no hydrated flows, returns the skeleton order unchanged", () => {
    expect(order_flows([], skeleton, new Set())).toEqual(skeleton);
  });

  it("breaks an equal-recency tie by id and sorts a null last_synced_at last", () => {
    const hydrated: FlowSummary[] = [
      summary({ id: "z", is_hydrated: true, last_synced_at: null }),
      summary({ id: "b", is_hydrated: true, last_synced_at: "2026-06-01T00:00:00Z" }),
      summary({ id: "a", is_hydrated: true, last_synced_at: "2026-06-01T00:00:00Z" }),
    ];
    expect(order_flows(hydrated, [], new Set()).map((f) => f.id)).toEqual(["a", "b", "z"]);
  });
});

describe("read_hydrated_flows", () => {
  it("maps agentic.flow nodes to hydrated summaries and ignores other kinds + tombstones", () => {
    const summaries = read_hydrated_flows([
      {
        id: "src/a.ts#run:function",
        kind: FLOW_NODE_KIND,
        path: "",
        anchor: null,
        layer: "agentic",
        attributes: { label: "Run", last_synced_at: "2026-06-01T00:00:00Z", member_count: 4 },
        field_ownership: {},
        origin: "flow-detector",
        intent_source: "code-edit",
        deleted_at: null,
      },
      { id: "leaf", kind: "code.function", path: "a.ts", anchor: null, layer: "raw", attributes: {}, field_ownership: {}, origin: "x", intent_source: "code-edit", deleted_at: null },
      { id: "gone", kind: FLOW_NODE_KIND, path: "", anchor: null, layer: "agentic", attributes: {}, field_ownership: {}, origin: "flow-detector", intent_source: "code-edit", deleted_at: "2026-06-02T00:00:00Z" },
    ]);
    expect(summaries).toEqual([
      {
        id: "src/a.ts#run:function",
        label: "Run",
        is_hydrated: true,
        last_synced_at: "2026-06-01T00:00:00Z",
        member_count: 4,
        is_unattributed: false,
        seed_location: null,
      },
    ]);
  });

  it("falls back to the node id for a missing label and zero for a missing member_count", () => {
    const [flow] = read_hydrated_flows([
      {
        id: "src/x.ts#run:function",
        kind: FLOW_NODE_KIND,
        path: "",
        anchor: null,
        layer: "agentic",
        attributes: {},
        field_ownership: {},
        origin: "flow-detector",
        intent_source: "code-edit",
        deleted_at: null,
      },
    ]);
    expect(flow).toMatchObject({ label: "src/x.ts#run:function", member_count: 0 });
  });
});

describe("collect_persisted_flow", () => {
  const flow_id = "src/main.ts#main:function";
  const member_id = "src/api.ts#send:function";
  const flow_node = build_flow_node({ id: flow_id, label: "Main", entry_points: [flow_id], exit_points: [], rationale: "" });
  const member_edges = build_flow_member_edges(flow_id, [member_id]);

  it("returns undefined when no live flow node matches the id", () => {
    expect(collect_persisted_flow("missing", [flow_node], [])).toBeUndefined();
  });

  it("gathers the flow's member edges and only the bridge edges incident to a member", () => {
    const incident = edge({ key: "b1", src_id: member_id, dst_id: "src/other.ts#run:function", kind: BRIDGE_EDGE_KIND });
    const unrelated = edge({ key: "b2", src_id: "x", dst_id: "y", kind: BRIDGE_EDGE_KIND });
    const rows = collect_persisted_flow(flow_id, [flow_node], [...member_edges, incident, unrelated]);
    expect(rows?.member_edges.map((e) => e.dst_id)).toEqual([member_id]);
    expect(rows?.bridge_edges.map((e) => e.key)).toEqual(["b1"]);
  });
});

describe("reconstruct_flow_membership", () => {
  const graph = make_graph(
    [
      { id: "main", name: "main", file: "src/main.ts" },
      { id: "other", name: "other", file: "src/other.ts" },
    ],
    ["main"],
  );

  it("resolves stored entry_points to live seeds and routes the unresolvable ones to linked docs", () => {
    const flow_node = build_flow_node({
      id: "src/main.ts#main:function",
      label: "Main",
      entry_points: ["src/main.ts#main:function", "docs/readme.md"],
      exit_points: [],
      rationale: "",
    });
    const membership = reconstruct_flow_membership({ flow_node, member_edges: [], bridge_edges: [] }, graph);
    expect(membership.id).toBe("src/main.ts#main:function");
    expect(membership.seeds).toEqual(["main"]);
    expect(membership.linked_docs).toEqual(["docs/readme.md"]);
  });

  it("resolves a bridge dst to a live symbol id and routes a doc-target bridge to linked docs", () => {
    const flow_node = build_flow_node({
      id: "src/main.ts#main:function",
      label: "Main",
      entry_points: ["src/main.ts#main:function"],
      exit_points: [],
      rationale: "",
    });
    const bridge_to_code = edge({ key: "b1", src_id: "src/main.ts#main:function", dst_id: "src/other.ts#other:function", kind: BRIDGE_EDGE_KIND });
    const bridge_to_doc = edge({ key: "b2", src_id: "src/main.ts#main:function", dst_id: "skills/foo.md", kind: BRIDGE_EDGE_KIND });
    const membership = reconstruct_flow_membership(
      { flow_node, member_edges: [], bridge_edges: [bridge_to_code, bridge_to_doc] },
      graph,
    );
    expect(membership.bridges).toEqual([{ src_id: "src/main.ts#main:function", dst_id: "other" }]);
    expect(membership.linked_docs).toEqual(["skills/foo.md"]);
  });
});

describe("hydrated_seed_paths", () => {
  it("unions every live flow node's entry_points and skips other kinds + tombstones", () => {
    const paths = hydrated_seed_paths([
      {
        id: "grp.ts#run:function",
        kind: FLOW_NODE_KIND,
        path: "",
        anchor: null,
        layer: "agentic",
        attributes: { entry_points: ["grp.ts#run:function", "dep.ts#embed:function"] },
        field_ownership: {},
        origin: "flow-detector",
        intent_source: "code-edit",
        deleted_at: null,
      },
      { id: "leaf", kind: "code.function", path: "a.ts", anchor: null, layer: "raw", attributes: { entry_points: ["nope"] }, field_ownership: {}, origin: "x", intent_source: "code-edit", deleted_at: null },
      { id: "gone", kind: FLOW_NODE_KIND, path: "", anchor: null, layer: "agentic", attributes: { entry_points: ["dead"] }, field_ownership: {}, origin: "flow-detector", intent_source: "code-edit", deleted_at: "2026-06-02T00:00:00Z" },
    ]);
    expect([...paths].sort()).toEqual(["dep.ts#embed:function", "grp.ts#run:function"]);
  });
});

describe("persistence-row builders", () => {
  it("builds an agentic.flow node with the attribute bag, layer agentic, no anchor", () => {
    const node = build_flow_node({
      id: "src/main.ts#main:function",
      label: "Main flow",
      entry_points: ["src/main.ts#main:function"],
      exit_points: ["src/api.ts#send:function"],
      rationale: "Reachable from main",
      last_synced_at: "2026-06-01T00:00:00Z",
    });
    expect(node.kind).toBe(FLOW_NODE_KIND);
    expect(node.layer).toBe("agentic");
    expect(node.anchor).toBeNull();
    expect(node.attributes).toMatchObject({
      label: "Main flow",
      entry_points: ["src/main.ts#main:function"],
      exit_points: ["src/api.ts#send:function"],
      rationale: "Reachable from main",
      last_synced_at: "2026-06-01T00:00:00Z",
    });
  });

  it("builds flow_member edges (NOT agentic.contains) with deterministic keys", () => {
    const edges = build_flow_member_edges("flow1", ["z", "a"]);
    expect(edges.map((e) => e.dst_id)).toEqual(["a", "z"]); // sorted
    expect(edges.every((e) => e.kind === FLOW_MEMBER_EDGE_KIND)).toBe(true);
    expect(edges[0].key).toBe("agentic.flow_member:flow1->a");
  });
});

describe("skeleton_to_summary", () => {
  it("marks a skeleton flow never-hydrated", () => {
    const [flow] = build_skeleton_flows(make_graph([{ id: "main", name: "main", file: "m.ts" }], ["main"]));
    expect(skeleton_to_summary(flow)).toMatchObject({ is_hydrated: false, last_synced_at: null });
  });
});

function edge(over: { key: string; src_id: string; dst_id: string; kind: string }): EdgeRow {
  return {
    key: over.key,
    src_id: over.src_id,
    dst_id: over.dst_id,
    kind: over.kind,
    confidence: 1,
    layer: "agentic",
    attributes: {},
    field_ownership: {},
    origin: "flow-detector",
    intent_source: "code-edit",
    adjudication: null,
    deleted_at: null,
  };
}

function summary(over: Partial<FlowSummary> & { id: string }): FlowSummary {
  return {
    id: over.id,
    label: over.label ?? over.id,
    is_hydrated: over.is_hydrated ?? false,
    last_synced_at: over.last_synced_at ?? null,
    member_count: over.member_count ?? 0,
    is_unattributed: over.is_unattributed ?? false,
    seed_location: over.seed_location ?? null,
  };
}
