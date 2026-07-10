import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { AnyDefinition, FilePath, ScopeId, SymbolId, SymbolName } from "@ariadnejs/types";
import type { AnchoredSymbol, GraphStore, NodeRow } from "@code-charter/core";
import { DESCRIPTION_NODE_KIND, description_node_id, format_anchor, open_graph_store, write_descriptions } from "@code-charter/core";

import { existing_descriptions, resolve_descriptions } from "./describe";

function make_definition(name: string, docstring?: string): AnyDefinition {
  const base = {
    kind: "function",
    symbol_id: name as SymbolId,
    name: name as SymbolName,
    defining_scope_id: "scope:0" as ScopeId,
    location: { file_path: "f.ts" as FilePath, start_line: 1, start_column: 0, end_line: 1, end_column: 1 },
    is_exported: false,
    signature: { parameters: [] },
    body_scope_id: "scope:1" as ScopeId,
  } as const;
  return docstring === undefined ? base : { ...base, docstring };
}

function anchored(
  symbol_path: string,
  opts: { content_hash?: string; file_path?: string; docstring?: string; name?: string } = {},
): AnchoredSymbol {
  const content_hash = opts.content_hash ?? "h1";
  const name = opts.name ?? symbol_path;
  const file_path = opts.file_path ?? "f.ts";
  return {
    symbol_id: symbol_path as SymbolId,
    symbol_path,
    content_hash,
    anchor: format_anchor({ symbol_path, content_hash }),
    file_path,
    definition: make_definition(name, opts.docstring),
  };
}

function description_node(symbol_path: string): NodeRow {
  return {
    id: description_node_id(symbol_path),
    kind: DESCRIPTION_NODE_KIND,
    path: "f.ts",
    anchor: format_anchor({ symbol_path, content_hash: "h1" }),
    layer: "agentic",
    attributes: {},
    field_ownership: {},
    origin: "test",
    intent_source: "code-edit",
    deleted_at: null,
  };
}

let repo: string;
let store: GraphStore;

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-describe-"));
  store = open_graph_store(path.join(repo, "graph.db"));
});

afterEach(() => {
  store.close();
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("existing_descriptions", () => {
  it("round-trips a persisted description keyed by symbol_path", () => {
    write_descriptions(store, [
      { symbol_path: "f.ts#a:function", content_hash: "h1", file_path: "f.ts", text: "adds two numbers", source: "docstring" },
    ]);

    const existing = existing_descriptions(store);

    expect(existing.get("f.ts#a:function")).toEqual({
      described_at_content_hash: "h1",
      text: "adds two numbers",
      source: "docstring",
    });
  });

  it("recovers a symbol_path that itself contains colons and hashes", () => {
    write_descriptions(store, [
      { symbol_path: "f.ts#A.b:method", content_hash: "h9", file_path: "f.ts", text: "a method", source: "placeholder" },
    ]);

    const existing = existing_descriptions(store);

    expect([...existing.keys()]).toEqual(["f.ts#A.b:method"]);
    expect(existing.get("f.ts#A.b:method")?.described_at_content_hash).toBe("h9");
  });

  it("ignores nodes that are not descriptions", () => {
    store.upsert_node({
      id: "f.ts#a:function",
      kind: "code.function",
      path: "f.ts",
      anchor: "f.ts#a:function:h1",
      layer: "raw",
      attributes: { description: "not a description node", description_hash: "h1" },
      field_ownership: {},
      origin: "test",
      intent_source: "code-edit",
      deleted_at: null,
    });

    expect(existing_descriptions(store).size).toBe(0);
  });

  it("skips a description node whose hash is missing", () => {
    store.upsert_node(description_node("f.ts#a:function"));

    expect(existing_descriptions(store).has("f.ts#a:function")).toBe(false);
  });

  it("records an undefined text when only the hash is stored", () => {
    store.upsert_node(description_node("f.ts#a:function"));
    store.write_fields({ kind: "node", id: description_node_id("f.ts#a:function") }, { description_hash: "h1" }, "agentic");

    expect(existing_descriptions(store).get("f.ts#a:function")).toEqual({
      described_at_content_hash: "h1",
      text: undefined,
      source: undefined,
    });
  });

  it("drops an unrecognized description_source rather than passing it through", () => {
    store.upsert_node(description_node("f.ts#a:function"));
    store.write_fields(
      { kind: "node", id: description_node_id("f.ts#a:function") },
      { description_hash: "h1", description_source: "handwritten" },
      "agentic",
    );

    expect(existing_descriptions(store).get("f.ts#a:function")?.source).toBeUndefined();
  });
});

describe("resolve_descriptions", () => {
  it("uses an Ariadne docstring verbatim with a docstring source", () => {
    const resolved = resolve_descriptions(store, [anchored("f.ts#a:function", { docstring: "adds two numbers" })]);

    expect(resolved).toEqual([
      { symbol_path: "f.ts#a:function", content_hash: "h1", file_path: "f.ts", text: "adds two numbers", source: "docstring" },
    ]);
  });

  it("writes the symbol name as a provisional stand-in for a member with no docstring (awaiting the agent pass)", () => {
    const resolved = resolve_descriptions(store, [anchored("f.ts#b:function", { name: "b" })]);

    expect(resolved).toEqual([
      { symbol_path: "f.ts#b:function", content_hash: "h1", file_path: "f.ts", text: "b", source: "provisional" },
    ]);
  });

  it("omits a member already described at its current content_hash", () => {
    write_descriptions(store, [
      { symbol_path: "f.ts#a:function", content_hash: "h1", file_path: "f.ts", text: "cached", source: "docstring" },
    ]);

    const resolved = resolve_descriptions(store, [anchored("f.ts#a:function", { content_hash: "h1", docstring: "doc" })]);

    expect(resolved).toEqual([]);
  });

  it("re-describes a member whose content_hash changed since it was described", () => {
    write_descriptions(store, [
      { symbol_path: "f.ts#a:function", content_hash: "old", file_path: "f.ts", text: "stale", source: "docstring" },
    ]);

    const resolved = resolve_descriptions(store, [anchored("f.ts#a:function", { content_hash: "new", docstring: "fresh" })]);

    expect(resolved).toEqual([
      { symbol_path: "f.ts#a:function", content_hash: "new", file_path: "f.ts", text: "fresh", source: "docstring" },
    ]);
  });

  it("carries each member's own file_path", () => {
    const resolved = resolve_descriptions(store, [
      anchored("a.ts#a:function", { file_path: "a.ts", docstring: "from a" }),
      anchored("b.ts#b:function", { file_path: "b.ts", docstring: "from b" }),
    ]);

    expect(new Map(resolved.map((r) => [r.symbol_path, r.file_path]))).toEqual(
      new Map([
        ["a.ts#a:function", "a.ts"],
        ["b.ts#b:function", "b.ts"],
      ]),
    );
  });

  it("returns an empty array for no members", () => {
    expect(resolve_descriptions(store, [])).toEqual([]);
  });
});
