import type { CallGraph, SymbolId } from "@ariadnejs/types";
import type { EdgeRow } from "@code-charter/types";

import { flow_id_of } from "../model/flow";
import { make_graph, make_node } from "../model/__fixtures__/call_graph";
import type { NodeSpec } from "../model/__fixtures__/call_graph";
import {
  derive_candidate_seeds,
  detect_gaps,
  find_disconnected_components,
  find_orphan_entrypoints,
  find_unresolved_shapes,
  DEFAULT_GAP_OPTIONS,
} from "./gap_detection";

const LITERAL_DOC_EDGE_KIND = "code.literal-doc";

/** The symbol_path a doc edge must reference to document a given entrypoint spec. */
function symbol_path_of(spec: NodeSpec): string {
  return flow_id_of(make_node(spec));
}

function doc_edge(src_id: string, over: Partial<EdgeRow> = {}): EdgeRow {
  return {
    key: `doc:${src_id}`,
    src_id,
    dst_id: "doc#1",
    kind: LITERAL_DOC_EDGE_KIND,
    confidence: 1,
    layer: "raw",
    attributes: {},
    field_ownership: {},
    origin: "test",
    intent_source: "code-edit",
    adjudication: null,
    deleted_at: null,
    ...over,
  };
}

describe("find_orphan_entrypoints (AC#1)", () => {
  const main: NodeSpec = { id: "main", name: "main", file: "m.ts" };
  const other: NodeSpec = { id: "other", name: "other", file: "o.ts" };

  it("flags an entrypoint with no incident doc edge and not one that has one", () => {
    const graph = make_graph([main, other], ["main", "other"]);
    const orphans = find_orphan_entrypoints(graph, [doc_edge(symbol_path_of(main))], DEFAULT_GAP_OPTIONS);
    expect(orphans.map((o) => o.flow_id)).toEqual([symbol_path_of(other)]);
    expect(orphans[0].name).toBe("other");
  });

  it("treats a doc edge on the dst side as documenting too", () => {
    const graph = make_graph([main], ["main"]);
    const edge = doc_edge("doc#1", { dst_id: symbol_path_of(main) });
    expect(find_orphan_entrypoints(graph, [edge], DEFAULT_GAP_OPTIONS)).toHaveLength(0);
  });

  it("does not treat a raw SymbolId as a documenting reference (id-space guard)", () => {
    const graph = make_graph([main], ["main"]);
    // A doc edge keyed on the Ariadne SymbolId 'main', not the symbol_path, must NOT document it.
    const orphans = find_orphan_entrypoints(graph, [doc_edge("main")], DEFAULT_GAP_OPTIONS);
    expect(orphans).toHaveLength(1);
  });

  it("ignores non-doc and soft-deleted edges", () => {
    const graph = make_graph([main], ["main"]);
    const calls = doc_edge(symbol_path_of(main), { kind: "code.calls" });
    const deleted = doc_edge(symbol_path_of(main), { deleted_at: "2026-01-01T00:00:00Z" });
    expect(find_orphan_entrypoints(graph, [calls, deleted], DEFAULT_GAP_OPTIONS)).toHaveLength(1);
  });

  it("excludes test entrypoints by default, includes them on request", () => {
    const t: NodeSpec = { id: "t", name: "t_main", file: "t.ts", is_test: true };
    const graph = make_graph([t], ["t"]);
    expect(find_orphan_entrypoints(graph, [], DEFAULT_GAP_OPTIONS)).toHaveLength(0);
    expect(find_orphan_entrypoints(graph, [], { ...DEFAULT_GAP_OPTIONS, include_tests: true })).toHaveLength(1);
  });
});

describe("find_unresolved_shapes (AC#1)", () => {
  it("flags a node whose call sites are a majority unresolved", () => {
    const graph = make_graph(
      [
        { id: "hub", name: "hub", file: "h.ts", calls: ["t"], unresolved_calls: ["x", "y", "z"] },
        { id: "t", name: "t", file: "t.ts" },
      ],
      [],
    );
    const shapes = find_unresolved_shapes(graph, DEFAULT_GAP_OPTIONS);
    const hub = shapes.find((s) => s.symbol_id === ("hub" as SymbolId))!;
    expect(hub.call_site_count).toBe(4);
    expect(hub.unresolved_count).toBe(3);
    expect(hub.unresolved_ratio).toBeCloseTo(0.75);
    expect(hub.resolved_out_degree).toBe(1);
  });

  it("does not flag a fully resolved node", () => {
    const graph = make_graph(
      [
        { id: "a", name: "a", file: "a.ts", calls: ["b"] },
        { id: "b", name: "b", file: "b.ts" },
      ],
      [],
    );
    expect(find_unresolved_shapes(graph, DEFAULT_GAP_OPTIONS)).toHaveLength(0);
  });

  it("does not flag a node below the min-call-sites floor", () => {
    const graph = make_graph([{ id: "a", name: "a", file: "a.ts", unresolved_calls: ["x"] }], []);
    expect(find_unresolved_shapes(graph, DEFAULT_GAP_OPTIONS)).toHaveLength(0);
  });

  it("reports dynamic dispatch as a field without flagging on it alone", () => {
    const graph = make_graph(
      [
        { id: "d", name: "d", file: "d.ts", dynamic_calls: [{ name: "go", targets: ["a", "b"] }, { name: "go2", targets: ["a", "b"] }] },
        { id: "a", name: "a", file: "a.ts" },
        { id: "b", name: "b", file: "b.ts" },
      ],
      [],
    );
    expect(find_unresolved_shapes(graph, DEFAULT_GAP_OPTIONS)).toHaveLength(0); // ratio 0, not flagged
  });

  it("excludes callback-invocation sites from the call-site count", () => {
    const graph = make_graph(
      [{ id: "c", name: "c", file: "c.ts", unresolved_calls: ["x", "y"], callback_calls: ["cb"] }, { id: "cb", name: "cb", file: "c.ts" }],
      [],
    );
    const shape = find_unresolved_shapes(graph, DEFAULT_GAP_OPTIONS)[0];
    expect(shape.call_site_count).toBe(2); // the callback site is not counted
  });
});

describe("find_disconnected_components (AC#1)", () => {
  it("surfaces an island reachable from no entrypoint", () => {
    const graph = make_graph(
      [
        { id: "main", name: "main", file: "m.ts", calls: ["helper"] },
        { id: "helper", name: "helper", file: "m.ts" },
        { id: "x", name: "x", file: "i.ts", calls: ["y"] },
        { id: "y", name: "y", file: "i.ts", calls: ["x"] },
      ],
      ["main"],
    );
    const components = find_disconnected_components(graph, DEFAULT_GAP_OPTIONS);
    expect(components).toHaveLength(1);
    expect(components[0].members).toEqual(["x", "y"]);
    expect(components[0].representative).toBe("x");
  });

  it("treats edges as undirected: a node linked into an entrypoint tree is not an island", () => {
    const graph = make_graph(
      [
        { id: "e", name: "e", file: "e.ts", calls: ["shared"] },
        { id: "a", name: "a", file: "a.ts", calls: ["shared"] },
        { id: "shared", name: "shared", file: "s.ts" },
      ],
      ["e"],
    );
    expect(find_disconnected_components(graph, DEFAULT_GAP_OPTIONS)).toHaveLength(0);
  });

  it("ranks multiple islands by size then id", () => {
    const graph = make_graph(
      [
        { id: "a", name: "a", file: "i1.ts", calls: ["b"] },
        { id: "b", name: "b", file: "i1.ts", calls: ["c"] },
        { id: "c", name: "c", file: "i1.ts" },
        { id: "x", name: "x", file: "i2.ts", calls: ["y"] },
        { id: "y", name: "y", file: "i2.ts" },
      ],
      [],
    );
    expect(find_disconnected_components(graph, DEFAULT_GAP_OPTIONS).map((c) => c.member_count)).toEqual([3, 2]);
  });

  it("drops an all-test island but keeps a mixed one", () => {
    const all_test = make_graph(
      [
        { id: "t1", name: "t1", file: "t.ts", is_test: true, calls: ["t2"] },
        { id: "t2", name: "t2", file: "t.ts", is_test: true, calls: ["t1"] },
      ],
      [],
    );
    expect(find_disconnected_components(all_test, DEFAULT_GAP_OPTIONS)).toHaveLength(0);

    const mixed = make_graph(
      [
        { id: "t", name: "t", file: "t.ts", is_test: true, calls: ["a"] },
        { id: "a", name: "a", file: "a.ts" },
      ],
      [],
    );
    expect(find_disconnected_components(mixed, DEFAULT_GAP_OPTIONS)).toHaveLength(1);
  });

  it("does not surface an indirectly-reachable node as its own island", () => {
    const nodes = new Map(
      [
        make_node({ id: "a", name: "a", file: "a.ts" }),
        make_node({ id: "b", name: "b", file: "b.ts", calls: ["c"] }),
        make_node({ id: "c", name: "c", file: "b.ts", calls: ["b"] }),
      ].map((n) => [n.symbol_id, n]),
    );
    const graph: CallGraph = {
      nodes,
      entry_points: [],
      indirect_reachability: new Map([
        [
          "a" as SymbolId,
          { function_id: "a" as SymbolId, reason: { type: "function_reference", read_location: nodes.get("a" as SymbolId)!.location } },
        ],
      ]),
    };
    const components = find_disconnected_components(graph, DEFAULT_GAP_OPTIONS);
    expect(components.map((c) => c.representative)).toEqual(["b"]);
  });
});

describe("detect_gaps + derive_candidate_seeds (AC#1/#4)", () => {
  const graph = make_graph(
    [
      { id: "main", name: "main", file: "m.ts" },
      { id: "x", name: "x", file: "i.ts", calls: ["y"] },
      { id: "y", name: "y", file: "i.ts", calls: ["x"] },
    ],
    ["main"],
  );

  it("derives one seed per orphan entrypoint and per disconnected component", () => {
    const report = detect_gaps(graph, []);
    const seeds = derive_candidate_seeds(report, graph);
    const origins = seeds.map((s) => s.origin).sort();
    expect(origins).toEqual(["disconnected_component", "orphan_entrypoint"]);
    const orphan = seeds.find((s) => s.origin === "orphan_entrypoint")!;
    expect(orphan.seeds).toEqual(["main"]);
    const component = seeds.find((s) => s.origin === "disconnected_component")!;
    expect(component.member_count).toBe(2);
  });

  it("records a truncation rather than silently capping", () => {
    const many = make_graph(
      [
        { id: "a", name: "a", file: "a.ts" },
        { id: "b", name: "b", file: "b.ts" },
        { id: "c", name: "c", file: "c.ts" },
      ],
      ["a", "b", "c"],
    );
    const report = detect_gaps(many, [], { max_per_category: 1 });
    expect(report.orphan_entrypoints).toHaveLength(1);
    expect(report.truncations).toContainEqual({ category: "orphan_entrypoints", total_found: 3, kept: 1 });
  });

  it("is deterministic regardless of input node order", () => {
    const a = detect_gaps(make_graph([{ id: "x", name: "x", file: "i.ts", calls: ["y"] }, { id: "y", name: "y", file: "i.ts", calls: ["x"] }], []), []);
    const b = detect_gaps(make_graph([{ id: "y", name: "y", file: "i.ts", calls: ["x"] }, { id: "x", name: "x", file: "i.ts", calls: ["y"] }], []), []);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
