import { afterEach, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  derive_code_state,
  description_node_id,
  open_graph_store,
  re_extract,
  write_descriptions,
  type GraphStore,
} from "@code-charter/core";

import type { SymbolId } from "@ariadnejs/types";

import { build_dedup_index, make_ariadne_adapter } from "./ariadne_adapter";
import { HeadlessProject } from "./headless_project";
import type { AriadneAdapter } from "./ariadne_adapter";

// A fixture dir holding exactly one file: two top-level block-bodied anonymous callbacks (which collide
// on `<file>#<anonymous>:function`) plus a named, described `named_thing`. The dir is isolated so the
// recursive `HeadlessProject` scan indexes only this file.
const FIXTURE_ROOT = path.resolve(__dirname, "__fixtures__", "anon_collide");
const REL = "module_with_anons.ts";
const NAMED_SYMBOL_PATH = "module_with_anons.ts#named_thing:function";
const ANON_SYMBOL_PATH = "module_with_anons.ts#<anonymous>:function";
const DESC_ID = description_node_id(NAMED_SYMBOL_PATH);

// One headless project for the whole file: the fixture is read-only across these tests, and each
// `HeadlessProject.initialize` accumulates Ariadne parser state in the worker process, so a single
// shared index keeps this suite's footprint minimal.
let project: HeadlessProject;
let adapter: AriadneAdapter;
let store: GraphStore;
let tmp_dir: string;

beforeAll(async () => {
  project = new HeadlessProject(FIXTURE_ROOT);
  await project.initialize();
  adapter = make_ariadne_adapter(project, () => {});
});

beforeEach(() => {
  tmp_dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-anon-"));
  store = open_graph_store(path.join(tmp_dir, "graph.db"));
});

afterEach(() => {
  store.close();
  fs.rmSync(tmp_dir, { recursive: true, force: true });
});

describe("ariadne_adapter — anonymous symbol_path collision (task-27.1.6.2)", () => {
  it("the fixture really contains >= 2 bodied anonymous callables (collision guard, at the Ariadne layer)", () => {
    // Asserted against the raw Ariadne index, not the resolver output: the resolver skips anonymous
    // callables, so pinning the fixture's triggering property at the Ariadne layer keeps this guard
    // independent of resolver behavior. If it ever drops below 2, the regression no longer exercises the bug.
    const index = project.get_index_single_file(REL);
    expect(index).toBeDefined();
    const anon = [...index!.functions.values()].filter((f) => f.name === "<anonymous>" && f.body_scope_id);
    expect(anon.length).toBeGreaterThanOrEqual(2);
  });

  it("(AC#1/#2/#4a) build_index returns a populated index with the named symbol and no <anonymous> record", () => {
    const index = adapter.build_index([REL]);

    // The duplicate anonymous callables are not resolver symbols, so the fixture's only resolver symbol
    // is the named function and the index holds exactly one entry.
    expect(index.by_symbol_path.size).toBe(1);
    expect(index.by_symbol_path.has(NAMED_SYMBOL_PATH)).toBe(true);
    expect(index.by_symbol_path.has(ANON_SYMBOL_PATH)).toBe(false);
  });

  it("(AC#3/#4b) re-sync preserves the named symbol's resolvable description — not soft-deleted", () => {
    // Derive the real anchor for the named symbol straight from the adapter, so the stored description's
    // content_hash matches the live code and resolves as a `hit` (never an accidental miss).
    const named = adapter.anchored_symbols([REL]).find((a) => a.symbol_path === NAMED_SYMBOL_PATH);
    expect(named).toBeDefined();

    write_descriptions(store, [
      {
        symbol_path: named!.symbol_path,
        content_hash: named!.content_hash,
        file_path: REL,
        text: "Sums the doubled inputs starting from seed.",
        source: "placeholder",
      },
    ]);
    expect(store.node(DESC_ID)).toBeDefined(); // it landed live

    re_extract([REL], "code-change", {
      store,
      extract_raw: adapter.extract_raw,
      build_index: adapter.build_index,
      analyzed_root: "",
    });

    const survivor = store.node(DESC_ID);
    expect(survivor).toBeDefined(); // still live — `node()` hides soft-deleted rows
    expect(survivor!.deleted_at).toBeNull();
    const soft_deleted = store
      .all_nodes({ include_deleted: true })
      .find((n) => n.id === DESC_ID && n.deleted_at != null);
    expect(soft_deleted).toBeUndefined();
  });

  it("(AC#5) logs a drop and keeps the first when a residual duplicate symbol_path is deduped", () => {
    // The upstream skip removes anonymous collisions, so build_index never drops in practice. The dedup
    // still guards the residual case — two *named* symbols deriving one symbol_path (a derivation defect,
    // e.g. a redeclaration) — which is reproduced here by two records sharing {name,kind,enclosing,file}.
    // This proves the defense path is wired to the log seam (no silent cap) AND keeps the first occurrence.
    const messages: string[] = [];
    const log = (message: string) => messages.push(message);
    const first = { file_path: "x.ts", name: "f", kind: "function" as const, enclosing: [], body_source: "return 1;" };
    const second = { ...first, body_source: "return 2;" };
    const index = build_dedup_index([first, second], log);

    expect(index.by_symbol_path.size).toBe(1);
    // First-wins, not just "one survives": the kept state carries the FIRST record's body, not the second's.
    const kept = index.by_symbol_path.get("x.ts#f:function");
    expect(kept?.content_hash).toBe(derive_code_state(first).content_hash);
    expect(kept?.content_hash).not.toBe(derive_code_state(second).content_hash);
    expect(messages.some((m) => m.includes("dropped duplicate symbol_path") && m.includes("x.ts#f:function"))).toBe(true);
  });
});

describe("ariadne_adapter — code accessors over the live project", () => {
  it("source_line returns the trimmed source at a 1-based line", () => {
    expect(adapter.source_line(REL, 6)).toBe("const inputs = [1, 2, 3];");
  });

  it("source_line returns undefined past the end of the file", () => {
    expect(adapter.source_line(REL, 9999)).toBeUndefined();
  });

  it("source_line returns undefined for a file the project never indexed", () => {
    expect(adapter.source_line("does_not_exist.ts", 1)).toBeUndefined();
  });

  it("file_of maps a call-graph node back to its repo-relative defining file", () => {
    const graph = adapter.call_graph();
    const [symbol_id, node] = [...graph.nodes.entries()][0];
    expect(node).toBeDefined();
    expect(adapter.file_of(symbol_id)).toBe(node.location.file_path);
    expect(adapter.file_of(symbol_id)).toBe(REL);
  });

  it("file_of returns undefined for a symbol id absent from the graph", () => {
    expect(adapter.file_of("nope#missing:function" as SymbolId)).toBeUndefined();
  });

  it("call_graph exposes the named symbol as a node", () => {
    const graph = adapter.call_graph();
    const files = [...graph.nodes.values()].map((n) => n.location.file_path);
    expect(files).toContain(REL);
  });
});
