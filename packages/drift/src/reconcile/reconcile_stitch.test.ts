/**
 * AC#9: Stitch path integration — verifies that `reconcile` with a stitch executor merges two
 * entrypoints split by an unresolved call into a single multi-seed umbrella (with an agentic.bridge),
 * while without an executor the same fixture produces two separate singleton flows (byte-identical to
 * the deterministic path).
 *
 * Uses a synthetic in-process call graph (no Ariadne headless process) so the fixture is fully
 * deterministic and exercises exactly the right code paths.
 */

import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type {
  AnyDefinition,
  CallGraph,
  CallableNode,
  CallReference,
  FilePath,
  Resolution,
  ScopeId,
  SymbolId,
  SymbolName,
} from "@ariadnejs/types";
import {
  BRIDGE_EDGE_KIND,
  build_resolver_index,
  FLOW_NODE_KIND,
  open_graph_store,
  type EntrypointStitchExecutor,
  type GraphStore,
  type StitchCandidate,
} from "@code-charter/core";

import type { AriadneAdapter } from "./ariadne_adapter";
import { read_persisted_flows } from "./flow_store";
import { reconcile } from "./reconcile";
import type { ReconcileDeps } from "./types";

// ---------------------------------------------------------------------------
// Synthetic graph: handler.ts#dispatch calls two unresolved targets (100%
// unresolved ratio, 2 call sites → qualifies as UnresolvedShape).
// router.ts#handle_request is a second orphan entrypoint nobody calls.
// ---------------------------------------------------------------------------

const DISPATCH_ID = "dispatch:sym" as SymbolId;
const HANDLE_REQUEST_ID = "handle_request:sym" as SymbolId;

function make_location(file: string, line: number) {
  return {
    file_path: file as FilePath,
    start_line: line,
    start_column: 0,
    end_line: line,
    end_column: 50,
  };
}

function unresolved_call(name: string, file: string, line: number): CallReference {
  return {
    location: make_location(file, line),
    name: name as SymbolName,
    scope_id: "scope:0" as ScopeId,
    call_type: "function",
    resolutions: [] as Resolution[],
  };
}

function make_stitch_graph(): CallGraph {
  const dispatch_def: AnyDefinition = {
    kind: "function",
    symbol_id: DISPATCH_ID,
    name: "dispatch" as SymbolName,
    defining_scope_id: "scope:0" as ScopeId,
    location: make_location("handler.ts", 1),
    is_exported: true,
    signature: { parameters: [] },
    body_scope_id: "scope:1" as ScopeId,
  };
  const handle_request_def: AnyDefinition = {
    kind: "function",
    symbol_id: HANDLE_REQUEST_ID,
    name: "handle_request" as SymbolName,
    defining_scope_id: "scope:0" as ScopeId,
    location: make_location("router.ts", 1),
    is_exported: true,
    signature: { parameters: [] },
    body_scope_id: "scope:1" as ScopeId,
  };

  const dispatch_node: CallableNode = {
    symbol_id: DISPATCH_ID,
    name: "dispatch" as SymbolName,
    location: make_location("handler.ts", 1),
    definition: dispatch_def,
    is_test: false,
    enclosed_calls: [
      // 2 unresolved calls → 100% unresolved ratio, ≥2 call sites → UnresolvedShape
      unresolved_call("handleRequest", "handler.ts", 2),
      unresolved_call("processRequest", "handler.ts", 3),
    ],
  };
  const handle_request_node: CallableNode = {
    symbol_id: HANDLE_REQUEST_ID,
    name: "handle_request" as SymbolName,
    location: make_location("router.ts", 1),
    definition: handle_request_def,
    is_test: false,
    enclosed_calls: [],
  };

  return {
    nodes: new Map([
      [DISPATCH_ID, dispatch_node],
      [HANDLE_REQUEST_ID, handle_request_node],
    ]),
    entry_points: [DISPATCH_ID, HANDLE_REQUEST_ID],
  };
}

function make_stub_adapter(graph: CallGraph): AriadneAdapter {
  return {
    call_graph: () => graph,
    extract_raw: () => {},
    build_index: () => build_resolver_index([]),
    anchored_symbols: () => [],
    file_of: (id) => graph.nodes.get(id)?.location.file_path ?? undefined,
    omitted_files: () => new Set(),
  };
}

// ---------------------------------------------------------------------------
// Stitch executor: confirms the (dispatch → handle_request) candidate stitch.
// ---------------------------------------------------------------------------

const confirming_executor: EntrypointStitchExecutor = async (
  candidates: readonly StitchCandidate[],
) => {
  const c = candidates.find(
    (x) =>
      x.source_seed.id.includes("dispatch") && x.target_seed.id.includes("handle_request"),
  );
  if (!c) return [];
  const unresolved_sym = c.unresolved_shapes_in_source[0].symbol_id;
  return [
    {
      label: "request dispatch flow",
      inference_rationale: "dispatch() calls handleRequest via dynamic registry lookup",
      merged_seeds: [...c.source_seed.seeds, ...c.target_seed.seeds],
      bridge: {
        src_symbol_id: unresolved_sym,
        dst_symbol_id: c.target_seed.seeds[0],
        source_file: "handler.ts",
        source_range: "L2",
      },
    },
  ];
};

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let store: GraphStore;
let clock: number;
const CHANGED = ["handler.ts", "router.ts"];

function make_deps(overrides?: Partial<ReconcileDeps>): ReconcileDeps {
  const graph = make_stitch_graph();
  return {
    store,
    adapter: make_stub_adapter(graph),
    repo_root_abs: "/repo",
    analyzed_root: "",
    now: () => new Date(2026, 0, 1, 0, 0, clock++).toISOString(),
    log: () => {},
    ...overrides,
  };
}

beforeEach(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "drift-stitch-"));
  store = open_graph_store(path.join(tmp, "graph.db"));
  clock = 0;
});

afterEach(() => {
  store.close();
});

describe("reconcile — agentic entrypoint stitch (AC#9)", () => {
  it("without a stitch executor: two orphan entrypoints produce two singleton flows (deterministic default)", async () => {
    await reconcile(CHANGED, make_deps());

    const flows = read_persisted_flows(store);
    expect(flows).toHaveLength(2);
    const ids = flows.map((f) => f.node.id).sort();
    expect(ids).toEqual(["handler.ts#dispatch:function", "router.ts#handle_request:function"]);
    // No bridge edges written
    const bridges = store.all_edges().filter((e) => e.kind === BRIDGE_EDGE_KIND);
    expect(bridges).toHaveLength(0);
  });

  it("with a stitch executor: two orphan entrypoints merge into one multi-seed umbrella with an agentic.bridge", async () => {
    await reconcile(CHANGED, make_deps({ stitch_entrypoints: confirming_executor }));

    const flows = read_persisted_flows(store);
    expect(flows).toHaveLength(1);

    const flow = flows[0];
    expect(flow.node.kind).toBe(FLOW_NODE_KIND);
    // Dominant id = alphabetically-first seed symbol_path
    expect(flow.node.id).toBe("handler.ts#dispatch:function");
    expect(flow.node.attributes.label).toBe("request dispatch flow");

    // Multi-seed: entry_points carries both seeds
    const entry_points = flow.node.attributes.entry_points as string[];
    expect(entry_points).toHaveLength(2);
    expect(entry_points).toContain("handler.ts#dispatch:function");
    expect(entry_points).toContain("router.ts#handle_request:function");

    // One agentic.bridge was written
    const bridges = store.all_edges().filter((e) => e.kind === BRIDGE_EDGE_KIND);
    expect(bridges).toHaveLength(1);
    expect(bridges[0].dst_id).toBe(HANDLE_REQUEST_ID);
  });

  it("stitch executor that declines all candidates: falls back to two singleton flows", async () => {
    const declining_executor: EntrypointStitchExecutor = async () => [];
    await reconcile(CHANGED, make_deps({ stitch_entrypoints: declining_executor }));

    const flows = read_persisted_flows(store);
    expect(flows).toHaveLength(2);
    const ids = flows.map((f) => f.node.id).sort();
    expect(ids).toEqual(["handler.ts#dispatch:function", "router.ts#handle_request:function"]);
  });
});
