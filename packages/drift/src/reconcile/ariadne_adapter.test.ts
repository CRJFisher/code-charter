import { afterEach, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  description_node_id,
  open_graph_store,
  re_extract,
  write_descriptions,
  type GraphStore,
} from "@code-charter/core";

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
    // Asserted against the raw Ariadne index, not the resolver output: the resolver now skips anonymous
    // callables, so this guard pins the fixture's triggering property independently of the fix and stays
    // green before and after it. If it ever drops below 2, the regression no longer exercises the bug.
    const index = project.get_index_single_file(REL);
    expect(index).toBeDefined();
    const anon = [...index!.functions.values()].filter((f) => f.name === "<anonymous>" && f.body_scope_id);
    expect(anon.length).toBeGreaterThanOrEqual(2);
  });

  it("(AC#1/#2/#4a) build_index returns a populated index with the named symbol and no <anonymous> record", () => {
    const index = adapter.build_index([REL]);

    // The duplicate anonymous callables no longer empty the index (the bug), and they are not symbols.
    expect(index.by_symbol_path.size).toBeGreaterThanOrEqual(1);
    expect(index.by_symbol_path.has(NAMED_SYMBOL_PATH)).toBe(true);
    expect(index.by_symbol_path.has(ANON_SYMBOL_PATH)).toBe(false);
  });

  it("(AC#3/#4b) re-sync preserves the named symbol's resolvable description — not binned", () => {
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
    const binned = store
      .all_nodes({ include_deleted: true })
      .find((n) => n.id === DESC_ID && n.deleted_at != null);
    expect(binned).toBeUndefined();
  });

  it("(AC#5) logs a drop when a residual duplicate symbol_path is deduped", () => {
    // Anonymous callables are skipped upstream, so build_index never drops in practice; this asserts the
    // defense-in-depth path is wired to the log seam (no silent cap) by feeding it a hand-built duplicate.
    const messages: string[] = [];
    const log = (message: string) => messages.push(message);
    const dup = { file_path: "x.ts", name: "f", kind: "function" as const, enclosing: [], body_source: "return 1;" };
    // Two resolver symbols share one symbol_path; the first wins, the second is logged + dropped.
    const index = build_dedup_index([dup, { ...dup, body_source: "return 2;" }], log);
    expect(index.by_symbol_path.size).toBe(1);
    expect(messages.some((m) => m.includes("dropped duplicate symbol_path") && m.includes("x.ts#f:function"))).toBe(true);
  });
});
