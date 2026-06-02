import { describe, expect, it } from "@jest/globals";

import {
  build_resolver_index,
  derive_code_state,
  format_anchor,
  NullGraphStore,
  open_graph_store,
  outstanding_drift,
  parse_anchor,
  re_extract,
  type ReExtractDeps,
  type ResolverSymbol,
} from "@code-charter/core";
import type { GraphStore, NodeRow } from "@code-charter/types";

import type { DriftCallLogEntry } from "./call_log";
import { drift_list, drift_resolve, type DriftToolContext } from "./drift_tool";

function make_context(): { context: DriftToolContext; entries: DriftCallLogEntry[] } {
  const entries: DriftCallLogEntry[] = [];
  return { context: { caller: "test-session", log: (entry) => entries.push(entry) }, entries };
}

function agentic_node(id: string, file_path: string): NodeRow {
  return {
    id,
    kind: "agentic.flow",
    path: file_path,
    anchor: null,
    layer: "agentic",
    attributes: {},
    field_ownership: {},
    origin: "test",
    intent_source: "code-edit",
    deleted_at: null,
  };
}

function seeded_store(): GraphStore {
  const store = open_graph_store(":memory:");
  store.upsert_node(agentic_node("src/a.ts#flow", "src/a.ts"));
  store.upsert_node(agentic_node("src/b.ts#flow", "src/b.ts"));
  store.soft_delete({ kind: "node", id: "src/a.ts#flow" });
  return store;
}

describe("drift_list", () => {
  it("returns the re-attachment bin (soft-deleted agentic rows) and logs the call", () => {
    const store = seeded_store();
    const { context, entries } = make_context();

    const bin = drift_list(store, {}, context);

    expect(bin.map((entry) => entry.id)).toEqual(["src/a.ts#flow"]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ caller: "test-session", tool: "drift_list" });
    store.close();
  });

  it("narrows the bin by scope prefix", () => {
    const store = open_graph_store(":memory:");
    store.upsert_node(agentic_node("src/a.ts#flow", "src/a.ts"));
    store.upsert_node(agentic_node("lib/c.ts#flow", "lib/c.ts"));
    store.soft_delete({ kind: "node", id: "src/a.ts#flow" });
    store.soft_delete({ kind: "node", id: "lib/c.ts#flow" });
    const { context } = make_context();

    expect(drift_list(store, { scope: "lib/" }, context).map((e) => e.id)).toEqual(["lib/c.ts#flow"]);
    store.close();
  });

  it("returns [] and still logs on a NullGraphStore (no throw)", () => {
    const { context, entries } = make_context();
    expect(drift_list(new NullGraphStore(), {}, context)).toEqual([]);
    expect(entries).toHaveLength(1);
  });
});

describe("drift_resolve", () => {
  it("reattach restores a bin entry; resolve is logged", () => {
    const store = seeded_store();
    const { context, entries } = make_context();

    const result = drift_resolve(store, { id: "src/a.ts#flow", resolution: "reattach" }, context);

    expect(result).toMatchObject({ target_kind: "node", applied: true });
    expect(store.node("src/a.ts#flow")?.deleted_at).toBeNull();
    expect(entries[0]).toMatchObject({ tool: "drift_resolve" });
    store.close();
  });

  it("delete keeps a bin entry soft-deleted", () => {
    const store = seeded_store();
    const { context } = make_context();
    const result = drift_resolve(store, { id: "src/a.ts#flow", resolution: "delete" }, context);
    expect(result.applied).toBe(true);
    expect(store.node("src/a.ts#flow")?.deleted_at).not.toBeNull();
    store.close();
  });

  it("an id not in the bin is a no-op with applied:false", () => {
    const store = seeded_store();
    const { context } = make_context();
    const result = drift_resolve(store, { id: "src/b.ts#flow", resolution: "reattach" }, context);
    expect(result).toMatchObject({ target_kind: null, applied: false });
    store.close();
  });

  it("no-ops without throwing on a NullGraphStore", () => {
    const { context, entries } = make_context();
    const result = drift_resolve(new NullGraphStore(), { id: "x", resolution: "delete" }, context);
    expect(result).toMatchObject({ applied: false });
    expect(entries).toHaveLength(1);
  });
});

// The leaf-rename milestone end-to-end (AC#3 + AC#4): a code rename re-syncs through `re_extract`,
// surfaces exactly one drifted node, and `drift.resolve {reanchor}` carries the hand-written
// description onto the renamed symbol untouched.
describe("drift.resolve reanchor — leaf-rename milestone (AC#3/#4)", () => {
  const DESC_ID = "user:description:helper";
  const DESCRIPTION = "the addition helper, by hand";
  const COMPUTE: ResolverSymbol = {
    file_path: "src/app.ts",
    name: "compute",
    kind: "function",
    enclosing: [],
    body_source: "{\n  return a + b;\n}",
  };
  // identical body ⇒ identical content_hash ⇒ the resolver reports `relocated`, not `miss`.
  const CALCULATE: ResolverSymbol = { ...COMPUTE, name: "calculate" };

  function raw_node(symbol: ResolverSymbol): NodeRow {
    const state = derive_code_state(symbol);
    return {
      id: state.symbol_path,
      kind: "code.function",
      path: symbol.file_path,
      anchor: format_anchor(state),
      layer: "raw",
      attributes: {},
      field_ownership: {},
      origin: "test",
      intent_source: "code-edit",
      deleted_at: null,
    };
  }

  /** Seed raw v1 (`compute`) plus a user description node anchored to it (promoted to layer='user'). */
  function seeded_milestone_store(): GraphStore {
    const store = open_graph_store(":memory:");
    store.upsert_node(raw_node(COMPUTE));
    store.upsert_node({
      id: DESC_ID,
      kind: "user.description",
      path: "src/app.ts",
      anchor: format_anchor(derive_code_state(COMPUTE)),
      layer: "agentic",
      attributes: {},
      field_ownership: {},
      origin: "test",
      intent_source: "explicit-pin",
      deleted_at: null,
    });
    store.write_fields({ kind: "node", id: DESC_ID }, { description: DESCRIPTION }, "user");
    return store;
  }

  function rename_deps(store: GraphStore): ReExtractDeps {
    return {
      store,
      extract_raw: (s) => s.upsert_node(raw_node(CALCULATE)),
      build_index: () => build_resolver_index([CALCULATE]),
      analyzed_root: "src",
    };
  }

  it("surfaces exactly one drifted node after the rename, then re-anchors it on accept", () => {
    const store = seeded_milestone_store();
    const { context } = make_context();

    // (1) the rename re-syncs out-of-band through the single funnel
    re_extract(["src/app.ts"], "code-change", rename_deps(store));

    // (2) session open would surface exactly one drifted node
    const drift = outstanding_drift(store);
    expect(drift).toHaveLength(1);
    expect(drift[0].node_id).toBe(DESC_ID);

    // (3) accept via drift.resolve re-anchors the preserved description onto the renamed symbol
    const result = drift_resolve(store, { id: DESC_ID, resolution: "reanchor" }, context);
    expect(result).toMatchObject({ applied: true, target_kind: "node" });
    expect(result.reanchored_to).toBe(derive_code_state(CALCULATE).symbol_path);

    // (4) the description rode across untouched and the drift is cleared
    const node = store.node(DESC_ID)!;
    expect(node.attributes.description).toBe(DESCRIPTION);
    expect(node.field_ownership.description).toBe("user");
    expect(parse_anchor(node.anchor!).symbol_path).toBe(derive_code_state(CALCULATE).symbol_path);
    expect(outstanding_drift(store)).toHaveLength(0);
    store.close();
  });

  it("reanchor on an id with no outstanding drift is a no-op with applied:false", () => {
    const store = seeded_milestone_store();
    const { context } = make_context();
    const result = drift_resolve(store, { id: DESC_ID, resolution: "reanchor" }, context);
    expect(result).toMatchObject({ applied: false, target_kind: null, reanchored_to: null });
    store.close();
  });
});
