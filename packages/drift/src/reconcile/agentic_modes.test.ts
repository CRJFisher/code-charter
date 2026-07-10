/**
 * AC#1 — the agent-facing write surface, exercised in memory (no built bin, no Ariadne). A hand-built
 * `CallGraph` and an `:memory:` store stand in for the live world, so each test pins the exact shape the
 * mode branches on:
 *
 *  - the two parse helpers reject every malformed wire contract and accept well-formed ones;
 *  - `apply_stitch` corroborates a bridge only against a real unresolved call (recording its canonical
 *    span + provenance), skips a resolved call, a callback site, and an endpoint absent from the graph,
 *    defaults the site file to the one embedded in `src_id`, and retires the singleton it absorbs;
 *  - `apply_descriptions` collapses duplicate symbol_paths last-wins, skips a path with no live anchor,
 *    cache-skips only when BOTH the content hash and the text match, and persists under the anchor's
 *    (possibly method-qualified) symbol_path rather than the wire path;
 *  - `build_entrypoint_inventory` reports the changed neighbourhood's entrypoints, gathering unresolved
 *    sites from the whole reachable tree while excluding resolved and callback calls.
 */

import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";

import {
  BRIDGE_CONFIDENCE_INFERRED,
  BRIDGE_EDGE_KIND,
  DESCRIPTION_NODE_KIND,
  LITERAL_DOC_EDGE_KIND,
  open_graph_store,
} from "@code-charter/core";
import type { EdgeRow, GraphStore } from "@code-charter/core";

import {
  apply_descriptions,
  apply_stitch,
  build_entrypoint_inventory,
  parse_apply_descriptions,
  parse_apply_stitch,
} from "./agentic_modes";
import { read_persisted_flows, write_flow } from "./flow_store";
import { anchored_of, id_of, make_adapter, make_deps, make_graph } from "./__fixtures__/agentic_graph";
import type { NodeSpec } from "./__fixtures__/agentic_graph";

let store: GraphStore;
let logs: string[];

beforeEach(() => {
  store = open_graph_store(":memory:");
  logs = [];
});

afterEach(() => {
  store.close();
});

/** Live (non-deleted) bridge edges — the post-write ground truth. */
function live_bridges(): EdgeRow[] {
  return store.all_edges().filter((e) => e.kind === BRIDGE_EDGE_KIND && e.deleted_at === null);
}

/**
 * Seed a live documentation edge onto `symbol_path`, clearing its orphan flag. The edge references the
 * flow-layer symbol_path (never the raw graph SymbolId — the id-space guard find_orphan_entrypoints
 * enforces). `upsert_edge` tolerates endpoints with no node row, as the flow/bridge writers already rely on.
 */
function seed_doc_edge(symbol_path: string): void {
  store.upsert_edge(
    {
      key: `doc:${symbol_path}`,
      src_id: symbol_path,
      dst_id: "docs/guide.md#doc",
      kind: LITERAL_DOC_EDGE_KIND,
      confidence: 1,
      layer: "raw",
      attributes: {},
      field_ownership: {},
      origin: "literal-doc",
      intent_source: "code-edit",
      adjudication: null,
      deleted_at: null,
    },
    [],
  );
}

describe("parse_apply_stitch — contract-breach shape", () => {
  it("rejects a non-object and a payload with no umbrellas array", () => {
    expect(parse_apply_stitch(null)).toEqual({ error: "expected { umbrellas: [...] }" });
    expect(parse_apply_stitch({ umbrellas: "nope" })).toEqual({ error: "expected { umbrellas: [...] }" });
  });

  it("rejects a non-object umbrella element", () => {
    expect(parse_apply_stitch({ umbrellas: [null] })).toEqual({ error: "umbrellas[0] is not an object" });
  });

  it("rejects a non-string label and a non-string rationale", () => {
    expect(parse_apply_stitch({ umbrellas: [{ label: 1, seeds: ["a#f:function"], rationale: "r" }] })).toEqual({
      error: "umbrellas[0].label is not a string",
    });
    expect(parse_apply_stitch({ umbrellas: [{ label: "l", seeds: ["a#f:function"], rationale: 2 }] })).toEqual({
      error: "umbrellas[0].rationale is not a string",
    });
  });

  it("rejects an empty or non-string seed array", () => {
    expect(parse_apply_stitch({ umbrellas: [{ label: "l", seeds: [], rationale: "r" }] })).toEqual({
      error: "umbrellas[0].seeds is not a non-empty string array",
    });
    expect(parse_apply_stitch({ umbrellas: [{ label: "l", seeds: [3], rationale: "r" }] })).toEqual({
      error: "umbrellas[0].seeds is not a non-empty string array",
    });
  });

  it("rejects a non-object bridge and a bridge missing a string src_id/dst_id or number line", () => {
    expect(
      parse_apply_stitch({ umbrellas: [{ label: "l", seeds: ["a#f:function"], rationale: "r", bridges: [null] }] }),
    ).toEqual({ error: "umbrellas[0].bridges[0] is not an object" });
    expect(
      parse_apply_stitch({
        umbrellas: [{ label: "l", seeds: ["a#f:function"], rationale: "r", bridges: [{ src_id: "a", dst_id: "b" }] }],
      }),
    ).toEqual({ error: "umbrellas[0].bridges[0] needs string src_id, dst_id and number line" });
  });

  it("accepts a well-formed payload and defaults a missing bridges array to empty", () => {
    const parsed = parse_apply_stitch({ umbrellas: [{ label: "l", seeds: ["a#f:function"], rationale: "r" }] });
    expect(parsed).toEqual({ input: { umbrellas: [{ label: "l", seeds: ["a#f:function"], rationale: "r", bridges: [] }] } });
  });

  it("preserves an optional bridge file and rationale only when present", () => {
    const parsed = parse_apply_stitch({
      umbrellas: [
        {
          label: "l",
          seeds: ["a#f:function"],
          rationale: "r",
          bridges: [{ src_id: "a#f:function", dst_id: "b#g:function", line: 5, file: "a.ts", rationale: "why" }],
        },
      ],
    });
    expect(parsed).toEqual({
      input: {
        umbrellas: [
          {
            label: "l",
            seeds: ["a#f:function"],
            rationale: "r",
            bridges: [{ src_id: "a#f:function", dst_id: "b#g:function", line: 5, file: "a.ts", rationale: "why" }],
          },
        ],
      },
    });
  });
});

describe("parse_apply_descriptions — contract-breach shape", () => {
  it("rejects a payload with no descriptions array", () => {
    expect(parse_apply_descriptions({})).toEqual({ error: "expected { descriptions: [...] }" });
  });

  it("rejects a non-object description element", () => {
    expect(parse_apply_descriptions({ descriptions: [5] })).toEqual({ error: "descriptions[0] is not an object" });
  });

  it("rejects an entry missing a string symbol_path or text", () => {
    expect(parse_apply_descriptions({ descriptions: [{ symbol_path: "a#f:function" }] })).toEqual({
      error: "descriptions[0] needs string symbol_path and text",
    });
    expect(parse_apply_descriptions({ descriptions: [{ symbol_path: 1, text: "t" }] })).toEqual({
      error: "descriptions[0] needs string symbol_path and text",
    });
  });

  it("accepts a well-formed payload", () => {
    expect(parse_apply_descriptions({ descriptions: [{ symbol_path: "a#f:function", text: "t" }] })).toEqual({
      input: { descriptions: [{ symbol_path: "a#f:function", text: "t" }] },
    });
  });
});

// The stitch fixture: dispatch calls an unresolved registry lookup at handler.ts:5, and handle_request
// (the real target the agent bridges to) is a second entrypoint reached only through the bridge.
const DISPATCH: NodeSpec = { file: "handler.ts", name: "dispatch", line: 3, calls: [{ line: 5, name: "fn" }] };
const HANDLE_REQUEST: NodeSpec = { file: "router.ts", name: "handle_request", line: 1 };
const DISPATCH_ID = id_of(DISPATCH);
const HANDLE_REQUEST_ID = id_of(HANDLE_REQUEST);

function stitch_graph() {
  return make_graph([DISPATCH, HANDLE_REQUEST], [DISPATCH, HANDLE_REQUEST]);
}

describe("apply_stitch — umbrella forming and seed handling", () => {
  it("forms one multi-seed umbrella over resolvable seeds, returning the full induced member set", async () => {
    const graph = stitch_graph();
    const deps = make_deps(store, make_adapter(graph), (m) => logs.push(m));

    const result = await apply_stitch(
      deps,
      { umbrellas: [{ label: "dispatch flow", seeds: [DISPATCH_ID, HANDLE_REQUEST_ID], rationale: "r" }] },
      graph,
    );

    expect(result.flows).toEqual([
      {
        id: DISPATCH_ID,
        members: [
          { symbol_path: DISPATCH_ID, name: "dispatch" },
          { symbol_path: HANDLE_REQUEST_ID, name: "handle_request" },
        ],
      },
    ]);
  });

  it("skips a bridge whose endpoint is not in the live graph, but still merges the umbrella", async () => {
    const graph = stitch_graph();
    const deps = make_deps(store, make_adapter(graph), (m) => logs.push(m));

    const result = await apply_stitch(
      deps,
      {
        umbrellas: [
          {
            label: "dispatch flow",
            seeds: [DISPATCH_ID, HANDLE_REQUEST_ID],
            rationale: "r",
            bridges: [{ src_id: DISPATCH_ID, dst_id: "ghost.ts#missing:function", file: "handler.ts", line: 5 }],
          },
        ],
      },
      graph,
    );

    expect(result.flows).toHaveLength(1); // the umbrella still forms
    expect(live_bridges()).toHaveLength(0);
    expect(logs).toContainEqual(expect.stringContaining("bridge endpoint not in the live graph, skipped"));
  });

  it("skips an unknown seed and drops an umbrella left with none", async () => {
    const graph = stitch_graph();
    const deps = make_deps(store, make_adapter(graph), (m) => logs.push(m));

    const result = await apply_stitch(
      deps,
      { umbrellas: [{ label: "ghost", seeds: ["nowhere.ts#missing:function"], rationale: "hallucinated" }] },
      graph,
    );

    expect(result.flows).toEqual([]);
    expect(logs).toContainEqual(expect.stringContaining("seed not in the live graph, skipped: nowhere.ts#missing:function"));
    expect(logs).toContainEqual(expect.stringContaining("umbrella 'ghost' has no resolvable seeds, skipped"));
  });

  it("does not double-claim a seed across umbrellas: the later umbrella drops it", async () => {
    const graph = stitch_graph();
    const deps = make_deps(store, make_adapter(graph), (m) => logs.push(m));

    const result = await apply_stitch(
      deps,
      {
        umbrellas: [
          { label: "first", seeds: [DISPATCH_ID, HANDLE_REQUEST_ID], rationale: "r" },
          { label: "second", seeds: [HANDLE_REQUEST_ID], rationale: "wants the same seed" },
        ],
      },
      graph,
    );

    expect(result.flows).toHaveLength(1);
    expect(logs).toContainEqual(expect.stringContaining("seed already claimed by an earlier umbrella, skipped: " + HANDLE_REQUEST_ID));
    expect(logs).toContainEqual(expect.stringContaining("umbrella 'second' has no resolvable seeds, skipped"));
  });

  it("retires the singleton flow an umbrella absorbs", async () => {
    const graph = stitch_graph();
    const deps = make_deps(store, make_adapter(graph), (m) => logs.push(m));
    // A pre-existing singleton flow keyed by the non-dominant seed — the fragment the stitch absorbs.
    write_flow(store, {
      id: HANDLE_REQUEST_ID,
      label: "handle_request",
      seed_paths: [HANDLE_REQUEST_ID],
      member_ids: [],
      rationale: "singleton",
      anchor_set: [HANDLE_REQUEST_ID],
      last_synced_at: deps.now(),
    });
    expect(read_persisted_flows(store).map((f) => f.node.id)).toEqual([HANDLE_REQUEST_ID]);

    await apply_stitch(
      deps,
      { umbrellas: [{ label: "dispatch flow", seeds: [DISPATCH_ID, HANDLE_REQUEST_ID], rationale: "r" }] },
      graph,
    );

    expect(read_persisted_flows(store).map((f) => f.node.id)).toEqual([DISPATCH_ID]);
    expect(logs).toContainEqual(expect.stringContaining(`retired singleton flow ${HANDLE_REQUEST_ID} (absorbed by ${DISPATCH_ID})`));
  });
});

// A two-level reachable tree: root resolves to leaf, and leaf carries one unresolved call and one
// callback invocation. So the corroboration gate sees all three call shapes, and the inventory's site
// collection must reach into leaf (a non-seed member) to find the gap.
const SVC_CB: NodeSpec = { file: "svc.ts", name: "cb" };
const SVC_LEAF: NodeSpec = {
  file: "svc.ts",
  name: "leaf",
  calls: [
    { line: 6, name: "gap", end_column: 9 }, // unresolved — the real bridge site, span 6:0-6:9
    { to: [id_of(SVC_CB)], line: 7, is_callback: true }, // callback — synthetic, excluded
  ],
};
const SVC_ROOT: NodeSpec = {
  file: "svc.ts",
  name: "root",
  line: 1,
  calls: [{ to: [id_of(SVC_LEAF)], line: 2 }], // resolved — not a comprehension gap
};
const ROOT_ID = id_of(SVC_ROOT);
const LEAF_ID = id_of(SVC_LEAF);

function svc_graph() {
  return make_graph([SVC_ROOT, SVC_LEAF, SVC_CB], [SVC_ROOT]);
}

describe("apply_stitch — bridge corroboration against the graph", () => {
  it("persists a bridge over a real unresolved call, recording its canonical span and stitch provenance", async () => {
    const graph = svc_graph();
    const deps = make_deps(store, make_adapter(graph), (m) => logs.push(m));

    await apply_stitch(
      deps,
      {
        umbrellas: [
          {
            label: "svc flow",
            seeds: [ROOT_ID],
            rationale: "root reaches leaf through the missed call",
            bridges: [{ src_id: ROOT_ID, dst_id: LEAF_ID, file: "svc.ts", line: 6 }], // no rationale → umbrella's
          },
        ],
      },
      graph,
    );

    const bridges = live_bridges();
    expect(bridges.map((e) => ({ src_id: e.src_id, dst_id: e.dst_id, confidence: e.confidence }))).toEqual([
      { src_id: ROOT_ID, dst_id: LEAF_ID, confidence: BRIDGE_CONFIDENCE_INFERRED },
    ]);
    expect(bridges[0].attributes.inference_rationale).toBe("root reaches leaf through the missed call"); // defaulted from the umbrella
    expect(store.provenance_for_edge(bridges[0].key)).toEqual([
      {
        edge_key: bridges[0].key,
        source_file: "svc.ts",
        source_range: "6:0-6:9", // start_line:start_col-end_line:end_col of the corroborated call
        extractor_id: "agentic.stitch",
        extractor_version: "1",
      },
    ]);
  });

  it("skips a bridge over a resolved call — corroboration demands an unresolved site, not merely a call", async () => {
    const graph = svc_graph();
    const deps = make_deps(store, make_adapter(graph), (m) => logs.push(m));

    await apply_stitch(
      deps,
      { umbrellas: [{ label: "svc", seeds: [ROOT_ID], rationale: "r", bridges: [{ src_id: ROOT_ID, dst_id: LEAF_ID, file: "svc.ts", line: 2 }] }] },
      graph,
    );

    expect(live_bridges()).toHaveLength(0);
    expect(logs).toContainEqual(expect.stringContaining("no unresolved call at svc.ts:2, bridge skipped"));
  });

  it("skips a bridge over a callback invocation — synthetic calls are not comprehension gaps", async () => {
    const graph = svc_graph();
    const deps = make_deps(store, make_adapter(graph), (m) => logs.push(m));

    await apply_stitch(
      deps,
      { umbrellas: [{ label: "svc", seeds: [ROOT_ID], rationale: "r", bridges: [{ src_id: ROOT_ID, dst_id: LEAF_ID, file: "svc.ts", line: 7 }] }] },
      graph,
    );

    expect(live_bridges()).toHaveLength(0);
    expect(logs).toContainEqual(expect.stringContaining("no unresolved call at svc.ts:7, bridge skipped"));
  });

  it("defaults the bridge's call-site file to the one embedded in src_id", async () => {
    const graph = svc_graph();
    const deps = make_deps(store, make_adapter(graph), (m) => logs.push(m));

    await apply_stitch(
      deps,
      { umbrellas: [{ label: "svc", seeds: [ROOT_ID], rationale: "r", bridges: [{ src_id: ROOT_ID, dst_id: LEAF_ID, line: 6 }] }] }, // no file
      graph,
    );

    const bridges = live_bridges();
    expect(bridges).toHaveLength(1); // resolved svc.ts from ROOT_ID and corroborated at line 6
    expect(store.provenance_for_edge(bridges[0].key)[0].source_file).toBe("svc.ts");
  });
});

describe("apply_descriptions", () => {
  const NODE: NodeSpec = { file: "a.ts", name: "f" };
  const NODE_ID = id_of(NODE);

  function describe_deps(anchored = [anchored_of({ file: "a.ts", name: "f", content_hash: "a".repeat(64) })]) {
    const graph = make_graph([NODE], [NODE]);
    return { graph, deps: make_deps(store, make_adapter(graph, { anchored }), (m) => logs.push(m)) };
  }

  it("collapses duplicate symbol_paths last-wins", () => {
    const { graph, deps } = describe_deps();
    const result = apply_descriptions(
      deps,
      { descriptions: [{ symbol_path: NODE_ID, text: "first" }, { symbol_path: NODE_ID, text: "second" }] },
      graph,
    );

    expect(result.written).toEqual([NODE_ID]); // one write, not two
    const node = store.all_nodes().find((n) => n.id === `${DESCRIPTION_NODE_KIND}:${NODE_ID}`);
    expect(node?.attributes.description).toBe("second"); // the later text wins
    expect(node?.attributes.description_source).toBe("llm");
  });

  it("skips a symbol_path with no live anchor", () => {
    const { graph, deps } = describe_deps();
    const result = apply_descriptions(
      deps,
      { descriptions: [{ symbol_path: "ghost.ts#nope:function", text: "no anchor" }] },
      graph,
    );

    expect(result).toEqual({ written: [], skipped: ["ghost.ts#nope:function"] });
    expect(logs).toContainEqual(expect.stringContaining("no live anchor for ghost.ts#nope:function, skipped"));
  });

  it("cache-skips only when both the content hash and the text match", () => {
    const { graph, deps } = describe_deps([anchored_of({ file: "a.ts", name: "f", content_hash: "a".repeat(64) })]);
    expect(apply_descriptions(deps, { descriptions: [{ symbol_path: NODE_ID, text: "v1" }] }, graph).written).toEqual([NODE_ID]);

    // Same text, same content hash → the cache skips the re-write.
    expect(apply_descriptions(deps, { descriptions: [{ symbol_path: NODE_ID, text: "v1" }] }, graph)).toEqual({
      written: [],
      skipped: [NODE_ID],
    });

    // Same text, but a different content hash (the body changed) → a re-describe, not a cache hit.
    const { graph: g2, deps: d2 } = describe_deps([anchored_of({ file: "a.ts", name: "f", content_hash: "b".repeat(64) })]);
    expect(apply_descriptions(d2, { descriptions: [{ symbol_path: NODE_ID, text: "v1" }] }, g2)).toEqual({
      written: [NODE_ID],
      skipped: [],
    });

    // Different text at the same content hash → a revision, also a write.
    const revised = apply_descriptions(deps, { descriptions: [{ symbol_path: NODE_ID, text: "v2" }] }, graph);
    expect(revised).toEqual({ written: [NODE_ID], skipped: [] });
    expect(store.all_nodes().find((n) => n.id === `${DESCRIPTION_NODE_KIND}:${NODE_ID}`)?.attributes.description).toBe("v2");
  });

  it("persists under the anchor's enclosing-qualified symbol_path, not the wire path (the method case)", () => {
    // The wire path is enclosing-free (`a.ts#process:function`); the anchor's stored path is
    // enclosing-qualified (`a.ts#Item.process:method`). The graph key (symbol_id) is location-based and
    // distinct from both — the two id spaces the join bridges.
    const WIRE = id_of({ file: "a.ts", name: "process" });
    const ANCHOR_PATH = "a.ts#Item.process:method";
    const method_node: NodeSpec = { file: "a.ts", name: "process", symbol_id: "loc:1" };
    const graph = make_graph([method_node], [method_node]);
    const anchored = [anchored_of({ file: "a.ts", name: "process", symbol_id: "loc:1", symbol_path: ANCHOR_PATH, content_hash: "c".repeat(64) })];
    const deps = make_deps(store, make_adapter(graph, { anchored }), (m) => logs.push(m));

    const result = apply_descriptions(deps, { descriptions: [{ symbol_path: WIRE, text: "runs the item" }] }, graph);

    expect(result.written).toEqual([WIRE]); // the write list reports the wire path the agent submitted
    // ...but the row persists under the anchor's method-qualified path.
    expect(store.all_nodes().find((n) => n.id === `${DESCRIPTION_NODE_KIND}:${ANCHOR_PATH}`)?.attributes.description).toBe("runs the item");
    expect(store.all_nodes().find((n) => n.id === `${DESCRIPTION_NODE_KIND}:${WIRE}`)).toBeUndefined();
  });
});

describe("build_entrypoint_inventory", () => {
  it("reports only entrypoints defined in a changed file, with their unresolved sites, flagged orphan", () => {
    const graph = stitch_graph();
    const sources = { "handler.ts": "\n\n\n\n  return fn();\n" }; // line 5 is the unresolved site
    const deps = make_deps(store, make_adapter(graph, { sources }), (m) => logs.push(m));

    // Only handler.ts changed: router.ts's entrypoint is out of the changed neighbourhood.
    const inventory = build_entrypoint_inventory(deps, ["handler.ts"], graph);

    expect(inventory).toEqual({
      entrypoints: [
        {
          symbol_path: DISPATCH_ID,
          name: "dispatch",
          file: "handler.ts",
          line: 3,
          is_orphan: true, // no documentation edge in the empty store
          unresolved_sites: [{ file: "handler.ts", line: 5, source_line: "return fn();" }],
        },
      ],
    });
  });

  it("gathers unresolved sites from the whole reachable tree, excluding resolved and callback calls", () => {
    const graph = svc_graph();
    // No sources → source_line falls back to the call's name.
    const deps = make_deps(store, make_adapter(graph), (m) => logs.push(m));

    const inventory = build_entrypoint_inventory(deps, ["svc.ts"], graph);

    expect(inventory.entrypoints).toHaveLength(1);
    // Only the unresolved call at line 6 surfaces: the resolved call (line 2) and the callback (line 7) are excluded.
    expect(inventory.entrypoints[0].unresolved_sites).toEqual([{ file: "svc.ts", line: 6, source_line: "gap" }]);
  });

  it("clears is_orphan for a documented entrypoint and flags an undocumented sibling", () => {
    // Two entrypoints in the changed file; document only dispatch via a live literal-doc edge.
    const secondary: NodeSpec = { file: "handler.ts", name: "secondary", line: 8 };
    const graph = make_graph([DISPATCH, secondary], [DISPATCH, secondary]);
    const deps = make_deps(store, make_adapter(graph), (m) => logs.push(m));
    seed_doc_edge(DISPATCH_ID);

    const by_path = new Map(
      build_entrypoint_inventory(deps, ["handler.ts"], graph).entrypoints.map((e) => [e.symbol_path, e.is_orphan]),
    );
    expect(by_path.get(DISPATCH_ID)).toBe(false); // documented → not an orphan
    expect(by_path.get(id_of(secondary))).toBe(true); // undocumented → orphan
  });

  it("excludes a test entrypoint from the inventory", () => {
    const test_entry: NodeSpec = { file: "handler.test.ts", name: "spec", is_test: true };
    const graph = make_graph([test_entry], [test_entry]);
    const deps = make_deps(store, make_adapter(graph), (m) => logs.push(m));

    expect(build_entrypoint_inventory(deps, ["handler.test.ts"], graph)).toEqual({ entrypoints: [] });
  });
});
