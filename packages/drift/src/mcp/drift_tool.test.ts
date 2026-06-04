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
import { drift_list, drift_next, drift_resolve, type DriftToolContext } from "./drift_tool";

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

    const result = drift_resolve(store, { kind: "node", id: "src/a.ts#flow", resolution: "reattach" }, context);

    expect(result).toMatchObject({ target_kind: "node", applied: true });
    expect(store.node("src/a.ts#flow")?.deleted_at).toBeNull();
    expect(entries[0]).toMatchObject({ tool: "drift_resolve" });
    store.close();
  });

  it("delete keeps a bin entry soft-deleted", () => {
    const store = seeded_store();
    const { context } = make_context();
    const result = drift_resolve(store, { kind: "node", id: "src/a.ts#flow", resolution: "delete" }, context);
    expect(result.applied).toBe(true);
    expect(store.node("src/a.ts#flow")?.deleted_at).not.toBeNull();
    store.close();
  });

  it("an id not in the bin is a no-op with applied:false", () => {
    const store = seeded_store();
    const { context } = make_context();
    const result = drift_resolve(store, { kind: "node", id: "src/b.ts#flow", resolution: "reattach" }, context);
    expect(result).toMatchObject({ target_kind: null, applied: false });
    store.close();
  });

  it("no-ops without throwing on a NullGraphStore", () => {
    const { context, entries } = make_context();
    const result = drift_resolve(new NullGraphStore(), { kind: "node", id: "x", resolution: "delete" }, context);
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
});

// The genuine MISS milestone end-to-end: a rename that ALSO changes the body produces a content hash the
// resolver cannot relocate, so the stranded user description is binned (soft-deleted) rather than staged.
// The user recovers it via the enriched `drift.list` payload — which surfaces the stranded text so the
// choice is informed — and a bare `drift.resolve {reattach}` restores it onto the ORIGINAL anchor. (Re-
// pointing onto a NEW symbol is the `target` form, exercised in the reattach-onto-target block below.)
describe("drift.list + reattach — genuine-miss recovery (bare reattach restores onto the original anchor)", () => {
  const DESC_ID = "user:description:calc";
  const STRANDED = "computes the running total, by hand";
  const ORIGINAL: ResolverSymbol = {
    file_path: "src/calc.ts",
    name: "compute",
    kind: "function",
    enclosing: [],
    body_source: "{\n  return a + b;\n}",
  };
  // Different name AND a different body (the `* b - 1` survives identifier-stripping) ⇒ a new content_hash
  // the resolver finds nowhere ⇒ `miss`, not `relocated`.
  const REWRITTEN: ResolverSymbol = { ...ORIGINAL, name: "calculate", body_source: "{\n  return a * b - 1;\n}" };

  function seeded_miss_store(): GraphStore {
    const store = open_graph_store(":memory:");
    store.upsert_node(raw_node(ORIGINAL));
    store.upsert_node({
      id: DESC_ID,
      kind: "user.description",
      path: "src/calc.ts",
      anchor: format_anchor(derive_code_state(ORIGINAL)),
      layer: "agentic",
      attributes: {},
      field_ownership: {},
      origin: "test",
      intent_source: "explicit-pin",
      deleted_at: null,
    });
    store.write_fields({ kind: "node", id: DESC_ID }, { description: STRANDED }, "user");
    return store;
  }

  function rewrite_deps(store: GraphStore): ReExtractDeps {
    return {
      store,
      extract_raw: (s) => s.upsert_node(raw_node(REWRITTEN)),
      build_index: () => build_resolver_index([REWRITTEN]),
      analyzed_root: "src",
    };
  }

  it("bins a genuine miss, surfaces it with the stranded text in drift.list, and reattach restores it", () => {
    // precondition: the rewrite genuinely changes the content hash (else it would relocate, not miss)
    expect(derive_code_state(ORIGINAL).content_hash).not.toBe(derive_code_state(REWRITTEN).content_hash);

    const store = seeded_miss_store();
    const { context } = make_context();

    // (1) the rename+rewrite re-syncs through the single funnel and reports exactly one miss
    const result = re_extract(["src/calc.ts"], "code-change", rewrite_deps(store));
    const misses = result.findings.filter((f) => f.reason === "miss");
    expect(misses).toHaveLength(1);
    expect(misses[0]).toMatchObject({ node_id: DESC_ID, to_symbol_path: null });

    // (2) a miss is binned, not staged: outstanding_drift stays empty, the bin holds the stranded node
    expect(outstanding_drift(store)).toHaveLength(0);
    const bin = drift_list(store, {}, context);
    const entry = bin.find((e) => e.id === DESC_ID);
    expect(entry).toMatchObject({
      kind: "node",
      node_kind: "user.description",
      user_authored: true,
      intent_source: "explicit-pin",
      description: STRANDED, // the enriched payload lets the chooser see what they are recovering
    });

    // (3) reattach restores the soft-deleted content
    const resolved = drift_resolve(store, { kind: "node", id: DESC_ID, resolution: "reattach" }, context);
    expect(resolved).toMatchObject({ target_kind: "node", applied: true, reanchored_to: null });

    // (4) the description survives, and a bare reattach restores onto the ORIGINAL anchor (it does not
    //     re-point onto `calculate` — that is the `target` form, below)
    const node = store.node(DESC_ID)!;
    expect(node.deleted_at).toBeNull();
    expect(node.attributes.description).toBe(STRANDED);
    expect(node.field_ownership.description).toBe("user");
    expect(parse_anchor(node.anchor!).symbol_path).toBe(derive_code_state(ORIGINAL).symbol_path);
    store.close();
  });
});

// AC#1 — reattach onto a NEW target. The original symbol is genuinely gone, but the user knows the right
// new symbol; `drift.resolve {reattach, target}` binds the stranded content onto it, carrying the authored
// description + its `user` ownership across, and clears the soft-delete. The bare form (no target) still
// restores onto the original anchor.
describe("drift.resolve reattach-onto-new-target (AC#1)", () => {
  const DESC_ID = "user:description:calc";
  const STRANDED = "computes the running total, by hand";
  const ORIGINAL: ResolverSymbol = {
    file_path: "src/calc.ts",
    name: "compute",
    kind: "function",
    enclosing: [],
    body_source: "{\n  return a + b;\n}",
  };
  // a present, unrelated symbol the user picks as the new home for the stranded description
  const TARGET: ResolverSymbol = {
    file_path: "src/calc.ts",
    name: "running_total",
    kind: "function",
    enclosing: [],
    body_source: "{\n  return xs.reduce((a, b) => a + b, 0);\n}",
  };

  /** Seed a soft-deleted (binned) description whose original anchor resolves nowhere, plus a live target. */
  function seeded_target_store(): GraphStore {
    const store = open_graph_store(":memory:");
    store.upsert_node(raw_node(TARGET)); // the live symbol that resolves today
    store.upsert_node({
      id: DESC_ID,
      kind: "user.description",
      path: "src/calc.ts",
      anchor: format_anchor(derive_code_state(ORIGINAL)),
      layer: "agentic",
      attributes: {},
      field_ownership: {},
      origin: "test",
      intent_source: "explicit-pin",
      deleted_at: null,
    });
    store.write_fields({ kind: "node", id: DESC_ID }, { description: STRANDED }, "user");
    store.soft_delete({ kind: "node", id: DESC_ID }); // strand it in the bin
    return store;
  }

  it("binds the stranded description onto the chosen new symbol, carrying authored fields across", () => {
    const store = seeded_target_store();
    const { context } = make_context();
    const target_symbol_path = derive_code_state(TARGET).symbol_path;

    const result = drift_resolve(
      store,
      { kind: "node", id: DESC_ID, resolution: "reattach", target: target_symbol_path },
      context,
    );
    expect(result).toMatchObject({ applied: true, target_kind: "node", reanchored_to: target_symbol_path });

    const node = store.node(DESC_ID)!;
    expect(node.deleted_at).toBeNull(); // un-binned
    expect(node.attributes.description).toBe(STRANDED); // authored text rides across
    expect(node.field_ownership.description).toBe("user"); // ownership preserved
    expect(parse_anchor(node.anchor!).symbol_path).toBe(target_symbol_path); // re-anchored onto TARGET, not ORIGINAL
    store.close();
  });

  it("offers the live symbol as a candidate so the chooser can pick it from drift.list alone", () => {
    const store = seeded_target_store();
    const { context } = make_context();
    const entry = drift_list(store, {}, context).find((e) => e.id === DESC_ID)!;
    expect(entry.candidates.map((c) => c.symbol_path)).toContain(derive_code_state(TARGET).symbol_path);
    store.close();
  });

  it("is a no-op when the target does not resolve to a live symbol today", () => {
    const store = seeded_target_store();
    const { context } = make_context();
    const result = drift_resolve(
      store,
      { kind: "node", id: DESC_ID, resolution: "reattach", target: "src/calc.ts#ghost:function" },
      context,
    );
    expect(result).toMatchObject({ applied: false });
    expect(store.node(DESC_ID)).toBeUndefined(); // still binned (soft-deleted), not restored
    store.close();
  });

  it("bare reattach (no target) still restores onto the original anchor", () => {
    const store = seeded_target_store();
    const { context } = make_context();
    const result = drift_resolve(store, { kind: "node", id: DESC_ID, resolution: "reattach" }, context);
    expect(result).toMatchObject({ applied: true, reanchored_to: null });
    expect(parse_anchor(store.node(DESC_ID)!.anchor!).symbol_path).toBe(derive_code_state(ORIGINAL).symbol_path);
    store.close();
  });
});

// AC#3 — `kind` addresses a node vs an edge explicitly, so a node id and an edge key that happen to
// collide each resolve to the right space, and a kind that names the wrong space is a clean no-op.
describe("drift.resolve kind disambiguation (AC#3)", () => {
  const COLLIDING = "shared-key"; // a string used as BOTH a node id and an edge key

  function seeded_collision_store(): GraphStore {
    const store = open_graph_store(":memory:");
    store.upsert_node(agentic_node(COLLIDING, "src/a.ts"));
    store.upsert_edge({
      key: COLLIDING,
      src_id: "src/a.ts#flow",
      dst_id: "src/b.ts#flow",
      kind: "agentic.bridge",
      confidence: 0.5,
      layer: "agentic",
      attributes: {},
      field_ownership: {},
      origin: "test",
      intent_source: "code-edit",
      adjudication: null,
      deleted_at: null,
    }, []);
    store.soft_delete({ kind: "node", id: COLLIDING });
    store.soft_delete({ kind: "edge", id: COLLIDING });
    return store;
  }

  it("resolves the node when kind is node", () => {
    const store = seeded_collision_store();
    const { context } = make_context();
    const result = drift_resolve(store, { kind: "node", id: COLLIDING, resolution: "reattach" }, context);
    expect(result).toMatchObject({ target_kind: "node", applied: true });
    expect(store.node(COLLIDING)?.deleted_at).toBeNull(); // the node was restored
    store.close();
  });

  it("resolves the edge when kind is edge", () => {
    const store = seeded_collision_store();
    const { context } = make_context();
    const result = drift_resolve(store, { kind: "edge", id: COLLIDING, resolution: "reattach" }, context);
    expect(result).toMatchObject({ target_kind: "edge", applied: true });
    expect(store.node(COLLIDING)?.deleted_at).not.toBeNull(); // the node was left untouched
    store.close();
  });
});

// AC#4 — drift.next walks the bin one entry at a time, in the same deterministic order drift.list uses.
describe("drift_next (AC#4)", () => {
  function bin_of(count: number): GraphStore {
    const store = open_graph_store(":memory:");
    for (let i = 0; i < count; i += 1) {
      const id = `src/f${i}.ts#flow`;
      store.upsert_node(agentic_node(id, `src/f${i}.ts`));
      store.soft_delete({ kind: "node", id });
    }
    return store;
  }

  it("returns the head of the bin and agrees with drift.list[0]", () => {
    const store = bin_of(3);
    const { context } = make_context();
    const next = drift_next(store, {}, context);
    expect(next?.id).toBe(drift_list(store, {}, context)[0].id);
    store.close();
  });

  it("advances as entries resolve and ends at null", () => {
    const store = bin_of(2);
    const { context } = make_context();
    const first = drift_next(store, {}, context)!;
    drift_resolve(store, { kind: "node", id: first.id, resolution: "delete" }, context);
    // delete keeps it soft-deleted, so it stays in the bin; restore to drain it instead
    drift_resolve(store, { kind: "node", id: first.id, resolution: "reattach" }, context);
    const second = drift_next(store, {}, context)!;
    expect(second.id).not.toBe(first.id);
    drift_resolve(store, { kind: "node", id: second.id, resolution: "reattach" }, context);
    expect(drift_next(store, {}, context)).toBeNull();
    store.close();
  });

  it("narrows by scope", () => {
    const store = open_graph_store(":memory:");
    store.upsert_node(agentic_node("src/a.ts#flow", "src/a.ts"));
    store.upsert_node(agentic_node("lib/c.ts#flow", "lib/c.ts"));
    store.soft_delete({ kind: "node", id: "src/a.ts#flow" });
    store.soft_delete({ kind: "node", id: "lib/c.ts#flow" });
    const { context } = make_context();
    expect(drift_next(store, { scope: "lib/" }, context)?.id).toBe("lib/c.ts#flow");
    store.close();
  });

  it("returns null and still logs on a NullGraphStore", () => {
    const { context, entries } = make_context();
    expect(drift_next(new NullGraphStore(), {}, context)).toBeNull();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ tool: "drift_next" });
  });
});
