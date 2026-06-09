import { describe, expect, it } from "@jest/globals";

import {
  build_resolver_index,
  derive_code_state,
  format_anchor,
  open_graph_store,
  outstanding_drift,
  parse_anchor,
  re_extract,
  type ReExtractDeps,
  type ResolverSymbol,
} from "@code-charter/core";
import type { GraphStore, NodeRow } from "@code-charter/types";

import type { DriftCallLogEntry } from "./call_log";
import { drift_resolve, type DriftToolContext } from "./drift_tool";

function make_context(): { context: DriftToolContext; entries: DriftCallLogEntry[] } {
  const entries: DriftCallLogEntry[] = [];
  return { context: { caller: "test-session", log: (entry) => entries.push(entry) }, entries };
}

/** A raw `code.function` node anchored to `symbol`'s current state. */
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

// The leaf-rename milestone end-to-end: a code rename re-syncs through `re_extract`, surfaces exactly
// one drifted node, and `drift.resolve {reanchor}` carries the preserved description onto the renamed
// symbol untouched. (The relocation/reanchor accept-dance is removed in task-27.1.15.1.)
describe("drift.resolve reanchor — leaf-rename milestone", () => {
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
    const result = drift_resolve(store, { kind: "node", id: DESC_ID, resolution: "reanchor" }, context);
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
    const result = drift_resolve(store, { kind: "node", id: DESC_ID, resolution: "reanchor" }, context);
    expect(result).toMatchObject({ applied: false, target_kind: null, reanchored_to: null });
    store.close();
  });

  it("reanchor on an edge is a no-op (outstanding drift is a node-only surface)", () => {
    const store = seeded_milestone_store();
    const { context } = make_context();
    const result = drift_resolve(store, { kind: "edge", id: DESC_ID, resolution: "reanchor" }, context);
    expect(result).toMatchObject({ applied: false, target_kind: null, reanchored_to: null });
    store.close();
  });
});
