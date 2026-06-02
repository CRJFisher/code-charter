import { describe, expect, it } from "@jest/globals";

import { NullGraphStore, open_graph_store } from "@code-charter/core";
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
