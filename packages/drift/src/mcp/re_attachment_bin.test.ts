import { describe, expect, it } from "@jest/globals";

import { derive_code_state, format_anchor, NullGraphStore, open_graph_store, type ResolverSymbol } from "@code-charter/core";
import type { NodeRow } from "@code-charter/types";

import { re_attachment_bin } from "./re_attachment_bin";

/** A raw `code.function` node anchored to `symbol`'s current state (a live re-attach target). */
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

function description_node(id: string, anchor: string | null, file_path: string): NodeRow {
  return {
    id,
    kind: "user.description",
    path: file_path,
    anchor,
    layer: "agentic",
    attributes: { description: "by hand" },
    field_ownership: { description: "user" },
    origin: "test",
    intent_source: "explicit-pin",
    deleted_at: null,
  };
}

const ORIGINAL: ResolverSymbol = {
  file_path: "src/calc.ts",
  name: "compute",
  kind: "function",
  enclosing: [],
  body_source: "{\n  return a + b;\n}",
};
// identical body ⇒ identical content_hash ⇒ a relocation candidate
const RELOCATED: ResolverSymbol = { ...ORIGINAL, name: "calculate" };

describe("re_attachment_bin candidates (AC#2)", () => {
  it("ranks a live raw symbol carrying the stranded body as a relocation candidate", () => {
    const store = open_graph_store(":memory:");
    store.upsert_node(raw_node(RELOCATED)); // the body moved here
    store.upsert_node(description_node("user:desc:calc", format_anchor(derive_code_state(ORIGINAL)), "src/calc.ts"));
    store.soft_delete({ kind: "node", id: "user:desc:calc" });

    const entry = re_attachment_bin(store).find((e) => e.id === "user:desc:calc")!;
    expect(entry.candidates[0]).toMatchObject({
      symbol_path: derive_code_state(RELOCATED).symbol_path,
      reason: "relocated",
    });
    store.close();
  });

  it("draws candidate targets only from live raw symbols, not scaffold/agentic rows", () => {
    const store = open_graph_store(":memory:");
    // a live agentic group (anchorless scaffold) must never be offered as a target
    store.upsert_node({
      id: "agentic.group:file:src/calc.ts",
      kind: "agentic.group",
      path: "src/calc.ts",
      anchor: null,
      layer: "agentic",
      attributes: {},
      field_ownership: {},
      origin: "module-scaffold",
      intent_source: "code-edit",
      deleted_at: null,
    });
    store.upsert_node(description_node("user:desc:calc", format_anchor(derive_code_state(ORIGINAL)), "src/calc.ts"));
    store.soft_delete({ kind: "node", id: "user:desc:calc" });

    const entry = re_attachment_bin(store).find((e) => e.id === "user:desc:calc")!;
    expect(entry.candidates).toEqual([]);
    store.close();
  });

  it("gives edge entries no candidates", () => {
    const store = open_graph_store(":memory:");
    store.upsert_edge(
      {
        key: "agentic.bridge:a->b",
        src_id: "src/a.ts#x:function",
        dst_id: "src/b.ts#y:function",
        kind: "agentic.bridge",
        confidence: 0.5,
        layer: "agentic",
        attributes: {},
        field_ownership: {},
        origin: "test",
        intent_source: "code-edit",
        adjudication: null,
        deleted_at: null,
      },
      [],
    );
    store.soft_delete({ kind: "edge", id: "agentic.bridge:a->b" });

    const entry = re_attachment_bin(store).find((e) => e.kind === "edge")!;
    expect(entry.candidates).toEqual([]);
    store.close();
  });

  it("returns entries in deterministic (deleted_at, id) order, id breaking ties", () => {
    const store = open_graph_store(":memory:");
    for (const id of ["src/z.ts#flow", "src/a.ts#flow", "src/m.ts#flow"]) {
      store.upsert_node(description_node(id, null, id.split("#")[0]));
      store.soft_delete({ kind: "node", id });
    }
    // soft-deletes within one test tick share a deleted_at, so id is the deterministic tiebreaker
    const ids = re_attachment_bin(store).map((e) => e.id);
    expect(ids).toEqual([...ids].sort());
    store.close();
  });

  it("is empty on a NullGraphStore", () => {
    expect(re_attachment_bin(new NullGraphStore())).toEqual([]);
  });
});
