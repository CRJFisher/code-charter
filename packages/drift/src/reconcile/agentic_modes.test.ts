/**
 * AC#1 — the agent-facing write surface, exercised in memory (no built bin, no Ariadne). A hand-built
 * `CallGraph` and an `:memory:` store stand in for the live world, so each test pins the exact shape the
 * mode branches on:
 *
 *  - the two parse helpers reject malformed wire contracts and accept well-formed ones;
 *  - `apply_stitch` skips a bridge whose endpoint is not in the graph and a bridge whose claimed call
 *    site the graph cannot corroborate, and retires the singleton an umbrella absorbs;
 *  - `apply_descriptions` collapses duplicate symbol_paths last-wins, skips a path with no live anchor,
 *    and cache-skips a byte-identical re-submission;
 *  - `build_entrypoint_inventory` reports the changed neighbourhood's entrypoints with their unresolved
 *    sites.
 */

import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";

import { BRIDGE_CONFIDENCE_INFERRED, BRIDGE_EDGE_KIND, DESCRIPTION_NODE_KIND, open_graph_store } from "@code-charter/core";
import type { GraphStore } from "@code-charter/core";

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

describe("parse_apply_stitch — contract-breach shape", () => {
  it("rejects a non-object and a payload with no umbrellas array", () => {
    expect(parse_apply_stitch(null)).toEqual({ error: "expected { umbrellas: [...] }" });
    expect(parse_apply_stitch({ umbrellas: "nope" })).toEqual({ error: "expected { umbrellas: [...] }" });
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

  it("rejects a bridge missing a string src_id/dst_id or a number line", () => {
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
// (the real target the agent bridges to) is a second entrypoint. Mirrors the reconcile_stitch scenario,
// hand-built.
const DISPATCH: NodeSpec = {
  file: "handler.ts",
  name: "dispatch",
  line: 3,
  calls: [{ line: 5, name: "fn", end_column: 12 }], // unresolved: no targets in the graph
};
const HANDLE_REQUEST: NodeSpec = { file: "router.ts", name: "handle_request", line: 1 };
const DISPATCH_ID = id_of(DISPATCH);
const HANDLE_REQUEST_ID = id_of(HANDLE_REQUEST);

function stitch_graph() {
  return make_graph([DISPATCH, HANDLE_REQUEST], [DISPATCH, HANDLE_REQUEST]);
}

describe("apply_stitch — bridge corroboration and seed handling", () => {
  it("persists a bridge whose claimed call site holds a real unresolved call", async () => {
    const graph = stitch_graph();
    const deps = make_deps(store, make_adapter(graph), (m) => logs.push(m));

    const result = await apply_stitch(
      deps,
      {
        umbrellas: [
          {
            label: "dispatch flow",
            seeds: [DISPATCH_ID, HANDLE_REQUEST_ID],
            rationale: "dispatch reaches handle_request through the registry lookup",
            bridges: [{ src_id: DISPATCH_ID, dst_id: HANDLE_REQUEST_ID, file: "handler.ts", line: 5 }],
          },
        ],
      },
      graph,
    );

    expect(result.flows).toEqual([
      { id: DISPATCH_ID, members: [{ symbol_path: DISPATCH_ID, name: "dispatch" }, { symbol_path: HANDLE_REQUEST_ID, name: "handle_request" }] },
    ]);
    const bridges = store
      .all_edges()
      .filter((e) => e.kind === BRIDGE_EDGE_KIND && e.deleted_at === null)
      .map((e) => ({ src_id: e.src_id, dst_id: e.dst_id, confidence: e.confidence }));
    expect(bridges).toEqual([{ src_id: DISPATCH_ID, dst_id: HANDLE_REQUEST_ID, confidence: BRIDGE_CONFIDENCE_INFERRED }]);
  });

  it("skips a bridge the graph cannot corroborate: a call site holding no unresolved call", async () => {
    const graph = stitch_graph();
    const deps = make_deps(store, make_adapter(graph), (m) => logs.push(m));

    await apply_stitch(
      deps,
      {
        umbrellas: [
          {
            label: "dispatch flow",
            seeds: [DISPATCH_ID, HANDLE_REQUEST_ID],
            rationale: "r",
            bridges: [{ src_id: DISPATCH_ID, dst_id: HANDLE_REQUEST_ID, file: "handler.ts", line: 3 }], // line 3 has no unresolved call
          },
        ],
      },
      graph,
    );

    expect(store.all_edges().filter((e) => e.kind === BRIDGE_EDGE_KIND && e.deleted_at === null)).toHaveLength(0);
    expect(logs).toContainEqual(expect.stringContaining("no unresolved call at handler.ts:3, bridge skipped"));
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
    expect(store.all_edges().filter((e) => e.kind === BRIDGE_EDGE_KIND && e.deleted_at === null)).toHaveLength(0);
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

describe("apply_descriptions", () => {
  const NODE: NodeSpec = { file: "a.ts", name: "f" };
  const NODE_ID = id_of(NODE);

  function describe_deps() {
    const graph = make_graph([NODE], [NODE]);
    const adapter = make_adapter(graph, { anchored: [anchored_of({ file: "a.ts", name: "f", content_hash: "h1" })] });
    return { graph, deps: make_deps(store, adapter, (m) => logs.push(m)) };
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

  it("cache-skips a byte-identical re-submission at the same content hash, but writes a revision", () => {
    const { graph, deps } = describe_deps();
    expect(apply_descriptions(deps, { descriptions: [{ symbol_path: NODE_ID, text: "v1" }] }, graph).written).toEqual([NODE_ID]);

    // Same text, same (unchanged) content hash → the description cache skips the re-write.
    const same = apply_descriptions(deps, { descriptions: [{ symbol_path: NODE_ID, text: "v1" }] }, graph);
    expect(same).toEqual({ written: [], skipped: [NODE_ID] });

    // Different text at the same content hash is a revision, not a cache hit — it writes.
    const revised = apply_descriptions(deps, { descriptions: [{ symbol_path: NODE_ID, text: "v2" }] }, graph);
    expect(revised).toEqual({ written: [NODE_ID], skipped: [] });
    expect(store.all_nodes().find((n) => n.id === `${DESCRIPTION_NODE_KIND}:${NODE_ID}`)?.attributes.description).toBe("v2");
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

  it("excludes a test entrypoint from the inventory", () => {
    const test_entry: NodeSpec = { file: "handler.test.ts", name: "spec", is_test: true };
    const graph = make_graph([test_entry], [test_entry]);
    const deps = make_deps(store, make_adapter(graph), (m) => logs.push(m));

    expect(build_entrypoint_inventory(deps, ["handler.test.ts"], graph)).toEqual({ entrypoints: [] });
  });
});
