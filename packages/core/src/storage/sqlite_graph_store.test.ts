import { mkdtempSync, rmSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { EdgeRow, NodeRow, ProvenanceRow } from "@code-charter/types";

import { open_graph_store } from "../index";
import { CURRENT_SCHEMA_VERSION } from "./schema";
import { SqliteGraphStore } from "./sqlite_graph_store";

function make_node(over: Partial<NodeRow> = {}): NodeRow {
  return {
    id: "f.ts#a",
    kind: "code.function",
    path: "f.ts",
    anchor: "f.ts/a:hash",
    layer: "raw",
    attributes: {},
    field_ownership: {},
    origin: "ariadne",
    intent_source: "code-edit",
    deleted_at: null,
    ...over,
  };
}

function make_edge(over: Partial<EdgeRow> = {}): EdgeRow {
  return {
    key: "e1",
    src_id: "f.ts#a",
    dst_id: "g.ts#b",
    kind: "code.calls",
    confidence: 1,
    layer: "raw",
    attributes: {},
    field_ownership: {},
    origin: "ariadne",
    intent_source: "code-edit",
    adjudication: null,
    deleted_at: null,
    ...over,
  };
}

function make_prov(over: Partial<ProvenanceRow> = {}): ProvenanceRow {
  return {
    edge_key: "e1",
    source_file: "f.ts",
    source_range: "1:0-2:0",
    extractor_id: "ariadne",
    extractor_version: "0.8.0",
    ...over,
  };
}

describe("SqliteGraphStore (:memory:)", () => {
  let store: SqliteGraphStore;

  beforeEach(() => {
    store = new SqliteGraphStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  describe("round-trip (AC#4)", () => {
    it("round-trips a node including nested JSON and open string columns", () => {
      const node = make_node({
        attributes: { description: "does a thing", members: ["x", "y"], meta: { n: 1 } },
        field_ownership: { description: "agentic", label: "user" },
        origin: "agent.summary",
        intent_source: "diagram-edit",
        layer: "agentic",
      });
      store.upsert_node(node);
      expect(store.node(node.id)).toEqual(node);
      expect(store.all_nodes()).toEqual([node]);
    });

    it("round-trips an edge with confidence, adjudication and provenance", () => {
      const edge = make_edge({ confidence: 0.5, layer: "agentic", adjudication: "rejected" });
      const provenance = [make_prov(), make_prov({ source_file: "g.ts", source_range: "3:0-4:0" })];
      store.upsert_edge(edge, provenance);
      expect(store.all_edges()).toEqual([edge]);
      expect(store.provenance_for_edge(edge.key)).toEqual(provenance);
    });

    it("preserves a null adjudication and never resurfaces it after a rewrite", () => {
      store.upsert_edge(make_edge({ adjudication: "rejected" }), [make_prov()]);
      store.upsert_edge(make_edge({ adjudication: null }), [make_prov()]);
      expect(store.all_edges()[0].adjudication).toBeNull();
    });
  });

  describe("soft delete (AC#5)", () => {
    it("hides soft-deleted rows by default and reveals them with include_deleted", () => {
      const node = make_node({ id: "f.ts#a", layer: "user" });
      store.upsert_node(node);
      store.soft_delete({ kind: "node", id: node.id });

      expect(store.node(node.id)).toBeUndefined();
      expect(store.all_nodes()).toEqual([]);
      const with_deleted = store.all_nodes({ include_deleted: true });
      expect(with_deleted).toHaveLength(1);
      expect(with_deleted[0].deleted_at).not.toBeNull();

      store.restore({ kind: "node", id: node.id });
      expect(store.node(node.id)).toEqual(node);
    });

    it("refuses to soft-delete raw rows", () => {
      const node = make_node({ layer: "raw" });
      store.upsert_node(node);
      store.soft_delete({ kind: "node", id: node.id });
      expect(store.node(node.id)).toEqual(node);
    });
  });

  describe("file incidence (AC#6)", () => {
    beforeEach(() => {
      store.upsert_node(make_node({ id: "f.ts#a", path: "f.ts", layer: "raw" }));
      store.upsert_node(make_node({ id: "f.ts#agentic", path: "f.ts", layer: "agentic" }));
      store.upsert_edge(make_edge({ key: "raw_A", layer: "raw" }), [make_prov({ edge_key: "raw_A", source_file: "A" })]);
      store.upsert_edge(make_edge({ key: "agentic_A", layer: "agentic" }), [
        make_prov({ edge_key: "agentic_A", source_file: "A" }),
      ]);
      store.upsert_edge(make_edge({ key: "raw_B", layer: "raw" }), [make_prov({ edge_key: "raw_B", source_file: "B" })]);
      // cross-file raw edge witnessed in both A and C
      store.upsert_edge(make_edge({ key: "raw_AC", layer: "raw" }), [
        make_prov({ edge_key: "raw_AC", source_file: "A" }),
        make_prov({ edge_key: "raw_AC", source_file: "C" }),
      ]);
    });

    it("edges_for_files returns exactly the edges sourced from the given files (ANY match)", () => {
      expect(new Set(store.edges_for_files(["A"]).map((e) => e.key))).toEqual(
        new Set(["raw_A", "agentic_A", "raw_AC"]),
      );
      expect(store.edges_for_files(["C"]).map((e) => e.key)).toEqual(["raw_AC"]);
      expect(store.edges_for_files([])).toEqual([]);
    });

    it("invalidate_edges_for_files removes only raw edges and cascades provenance", () => {
      store.invalidate_edges_for_files(["A"]);
      const remaining = new Set(store.all_edges().map((e) => e.key));
      expect(remaining).toEqual(new Set(["agentic_A", "raw_B"])); // raw_A and cross-file raw_AC gone
      expect(store.provenance_for_edge("raw_A")).toEqual([]);
      expect(store.provenance_for_edge("raw_AC")).toEqual([]);
    });

    it("invalidate_nodes_for_files removes only raw nodes from those files", () => {
      store.invalidate_nodes_for_files(["f.ts"]);
      const ids = store.all_nodes().map((n) => n.id);
      expect(ids).toEqual(["f.ts#agentic"]);
    });
  });

  describe("transactions (AC#7)", () => {
    it("rolls back an upsert_edge when its provenance violates a constraint", () => {
      const duplicate = make_prov();
      expect(() => store.upsert_edge(make_edge(), [duplicate, duplicate])).toThrow();
      expect(store.all_edges()).toEqual([]);
      expect(store.provenance_for_edge("e1")).toEqual([]);
    });

    it("rolls back rebuild_layer when the write callback throws", () => {
      store.upsert_node(make_node({ id: "raw_n", layer: "raw" }));
      store.upsert_node(make_node({ id: "agentic_n", layer: "agentic" }));
      expect(() =>
        store.rebuild_layer("raw", () => {
          throw new Error("boom");
        }),
      ).toThrow("boom");
      expect(new Set(store.all_nodes().map((n) => n.id))).toEqual(new Set(["raw_n", "agentic_n"]));
    });

    it("supports re-entrant writes inside rebuild_layer without a nested BEGIN error", () => {
      store.upsert_node(make_node({ id: "old_raw", layer: "raw" }));
      store.upsert_node(make_node({ id: "agentic_n", layer: "agentic" }));
      store.rebuild_layer("raw", (s) => {
        s.upsert_node(make_node({ id: "new_raw", layer: "raw" }));
        s.upsert_edge(make_edge({ key: "new_e", layer: "raw" }), [make_prov({ edge_key: "new_e" })]);
      });
      expect(new Set(store.all_nodes().map((n) => n.id))).toEqual(new Set(["new_raw", "agentic_n"]));
      expect(store.all_edges().map((e) => e.key)).toEqual(["new_e"]);
    });
  });

  describe("write_fields ladder", () => {
    it("skips a field owned by a higher tier and overwrites a lower-tier field", () => {
      store.upsert_node(make_node({ id: "n" }));
      store.write_fields({ kind: "node", id: "n" }, { label: "mine" }, "user");
      const skipped = store.write_fields({ kind: "node", id: "n" }, { label: "raw-attempt" }, "raw");
      expect(skipped).toEqual({ skipped: ["label"] });
      expect(store.node("n")?.attributes.label).toBe("mine");

      const ok = store.write_fields({ kind: "node", id: "n" }, { note: "hi" }, "agentic");
      expect(ok).toEqual({ skipped: [] });
      expect(store.node("n")?.attributes.note).toBe("hi");
      expect(store.node("n")?.field_ownership.note).toBe("agentic");
    });
  });

  describe("schema (AC#2)", () => {
    it("reports the current schema version and seeds the table registry", () => {
      expect(store.schema_version()).toBe(CURRENT_SCHEMA_VERSION);
      const disposition = store.table_disposition();
      const disposable = disposition.filter((t) => t.disposable).map((t) => t.table);
      expect(disposable).toEqual(["anchor_resolution"]);
      expect(new Set(disposition.map((t) => t.table))).toEqual(
        new Set(["nodes", "edges", "edge_provenance", "file_hashes", "anchor_resolution", "schema_version", "table_registry"]),
      );
    });
  });

  describe("round-trip edge cases (AC#4)", () => {
    it("round-trips a null anchor and a null value inside attributes", () => {
      const node = make_node({ id: "n.null", anchor: null, attributes: { note: null, kept: 1 } });
      store.upsert_node(node);
      expect(store.node(node.id)).toEqual(node);
    });
  });

  describe("neighborhood", () => {
    beforeEach(() => {
      for (const id of ["a", "b", "c", "d"]) store.upsert_node(make_node({ id, anchor: null }));
      store.upsert_edge(make_edge({ key: "ab", src_id: "a", dst_id: "b" }), []);
      store.upsert_edge(make_edge({ key: "bc", src_id: "b", dst_id: "c" }), []);
      store.upsert_edge(make_edge({ key: "ba", src_id: "b", dst_id: "a" }), []); // cycle a<->b
    });

    it("depth 0 returns just the seed node and no edges", () => {
      const { nodes, edges } = store.neighborhood("a", 0);
      expect(nodes.map((n) => n.id)).toEqual(["a"]);
      expect(edges).toEqual([]);
    });

    it("expands by depth, follows edges both directions, and terminates on cycles", () => {
      const d1 = store.neighborhood("a", 1);
      expect(new Set(d1.nodes.map((n) => n.id))).toEqual(new Set(["a", "b"]));
      expect(new Set(d1.edges.map((e) => e.key))).toEqual(new Set(["ab", "ba"]));

      const d2 = store.neighborhood("a", 2);
      expect(new Set(d2.nodes.map((n) => n.id))).toEqual(new Set(["a", "b", "c"]));
      expect(new Set(d2.edges.map((e) => e.key))).toEqual(new Set(["ab", "ba", "bc"]));
    });

    it("excludes soft-deleted nodes from the result", () => {
      store.upsert_node(make_node({ id: "b", anchor: null, layer: "user" }));
      store.soft_delete({ kind: "node", id: "b" });
      const { nodes } = store.neighborhood("a", 2);
      expect(nodes.map((n) => n.id)).not.toContain("b");
    });
  });

  describe("edge soft-delete and ladder (AC#5)", () => {
    it("soft-deletes, hides, reveals via include_deleted, and restores an edge", () => {
      store.upsert_edge(make_edge({ key: "e.user", layer: "user" }), []);
      store.soft_delete({ kind: "edge", id: "e.user" });
      expect(store.all_edges().map((e) => e.key)).toEqual([]);
      expect(store.all_edges({ include_deleted: true }).map((e) => e.key)).toEqual(["e.user"]);
      store.restore({ kind: "edge", id: "e.user" });
      expect(store.all_edges().map((e) => e.key)).toEqual(["e.user"]);
    });

    it("applies write_fields to an edge target", () => {
      store.upsert_edge(make_edge({ key: "e2" }), []);
      store.write_fields({ kind: "edge", id: "e2" }, { note: "user" }, "user");
      const skipped = store.write_fields({ kind: "edge", id: "e2" }, { note: "raw" }, "raw");
      expect(skipped).toEqual({ skipped: ["note"] });
      expect(store.all_edges()[0].attributes.note).toBe("user");
    });
  });

  describe("invalidation scoping and guards (AC#6)", () => {
    it("invalidate_nodes_for_files leaves raw nodes on other paths untouched", () => {
      store.upsert_node(make_node({ id: "f.ts#a", path: "f.ts", layer: "raw", anchor: null }));
      store.upsert_node(make_node({ id: "g.ts#b", path: "g.ts", layer: "raw", anchor: null }));
      store.invalidate_nodes_for_files(["f.ts"]);
      expect(store.all_nodes().map((n) => n.id)).toEqual(["g.ts#b"]);
    });

    it("empty-path invalidation is a no-op", () => {
      store.upsert_node(make_node({ id: "keep", layer: "raw", anchor: null }));
      store.upsert_edge(make_edge({ key: "keep_e", layer: "raw" }), [make_prov({ edge_key: "keep_e", source_file: "x" })]);
      expect(() => {
        store.invalidate_nodes_for_files([]);
        store.invalidate_edges_for_files([]);
      }).not.toThrow();
      expect(store.all_nodes()).toHaveLength(1);
      expect(store.all_edges()).toHaveLength(1);
    });
  });

  describe("performance (AC#9)", () => {
    it("a representative batch completes well under 500ms on :memory:", () => {
      const start = Date.now();
      for (let i = 0; i < 200; i++) {
        store.upsert_node(make_node({ id: `n${i}`, path: `f${i % 10}.ts`, anchor: null }));
        store.upsert_edge(make_edge({ key: `e${i}`, src_id: `n${i}`, dst_id: `n${(i + 1) % 200}`, layer: "raw" }), [
          make_prov({ edge_key: `e${i}`, source_file: `f${i % 10}.ts` }),
        ]);
      }
      store.all_nodes();
      store.all_edges();
      store.edges_for_files(["f1.ts", "f2.ts"]);
      expect(Date.now() - start).toBeLessThan(500);
    });
  });
});

describe("open_graph_store factory", () => {
  it("returns a working SQLite-backed store on a supported host", () => {
    const store = open_graph_store(":memory:");
    store.upsert_node(make_node());
    expect(store.all_nodes()).toHaveLength(1);
    store.close();
  });
});

describe("on-disk schema + rebuild (file-backed)", () => {
  const created_dirs: string[] = [];

  function temp_db_path(): string {
    const dir = mkdtempSync(join(tmpdir(), "cc-core-"));
    created_dirs.push(dir);
    return join(dir, "graph.db");
  }

  afterAll(() => {
    for (const dir of created_dirs) rmSync(dir, { recursive: true, force: true });
  });

  it("creates exactly the seven tables and the named indexes, with no anchors table (AC#2)", () => {
    const path = temp_db_path();
    new SqliteGraphStore(path).close();

    const raw = new DatabaseSync(path);
    const tables = (raw.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>).map(
      (r) => r.name,
    );
    expect(new Set(tables)).toEqual(
      new Set(["anchor_resolution", "edge_provenance", "edges", "file_hashes", "nodes", "schema_version", "table_registry"]),
    );
    expect(tables).not.toContain("anchors");
    const indexes = (raw.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as Array<{ name: string }>).map(
      (r) => r.name,
    );
    expect(indexes).toContain("idx_nodes_path");
    expect(indexes).toContain("idx_edge_provenance_file");
    raw.close();
  });

  it("drops only disposable tables on a version mismatch; preserved tables (incl. one registered after seeding) survive (AC#8)", () => {
    const path = temp_db_path();
    const store = new SqliteGraphStore(path);
    store.upsert_node(make_node({ id: "raw_keep", layer: "raw" }));
    store.upsert_node(make_node({ id: "user_keep", layer: "user" }));
    store.close();

    const raw = new DatabaseSync(path);
    // a row in the disposable cache
    raw.prepare("INSERT INTO anchor_resolution (anchor, status, resolved_at) VALUES (?, ?, ?)").run("a:h", "hit", "t");
    // a brand-new preserved table declared AFTER seeding (simulates task-27.2's pending_edit)
    raw.prepare("INSERT INTO table_registry (table_name, disposable) VALUES (?, ?)").run("pending_edit", 0);
    raw.exec("CREATE TABLE pending_edit (id TEXT PRIMARY KEY)");
    raw.prepare("INSERT INTO pending_edit (id) VALUES (?)").run("keep-me");
    // force a schema-version mismatch
    raw.prepare("UPDATE schema_version SET version = ? WHERE id = 1").run(0);
    raw.close();

    // reopen → triggers the table-granular rebuild
    const reopened = new SqliteGraphStore(path);
    expect(reopened.schema_version()).toBe(CURRENT_SCHEMA_VERSION);
    // preserved node rows (both raw and user tiers) survive the schema rebuild
    expect(new Set(reopened.all_nodes({ include_deleted: true }).map((n) => n.id))).toEqual(
      new Set(["raw_keep", "user_keep"]),
    );
    reopened.close();

    const check = new DatabaseSync(path);
    // the post-seed preserved table survives with no rebuild-code change
    expect(check.prepare("SELECT id FROM pending_edit").all()).toEqual([{ id: "keep-me" }]);
    // the disposable cache was dropped and recreated empty
    expect((check.prepare("SELECT COUNT(*) AS n FROM anchor_resolution").get() as { n: number }).n).toBe(0);
    check.close();
  });

  it("records and detects file content changes", () => {
    const dir = mkdtempSync(join(tmpdir(), "cc-core-fh-"));
    created_dirs.push(dir);
    const file = join(dir, "watched.txt");
    writeFileSync(file, "one");

    const store = new SqliteGraphStore(":memory:");
    expect(store.file_changed_since_recorded(file)).toBe(true); // never recorded
    store.record_file_hash(file);
    expect(store.file_changed_since_recorded(file)).toBe(false);
    writeFileSync(file, "two");
    expect(store.file_changed_since_recorded(file)).toBe(true);
    store.close();
  });

  it("reports a deleted recorded file as changed rather than throwing", () => {
    const dir = mkdtempSync(join(tmpdir(), "cc-core-del-"));
    created_dirs.push(dir);
    const file = join(dir, "gone.txt");
    writeFileSync(file, "x");

    const store = new SqliteGraphStore(":memory:");
    store.record_file_hash(file);
    rmSync(file);
    expect(store.file_changed_since_recorded(file)).toBe(true);
    store.close();
  });

  it("persists rows across close and reopen at the same schema version (AC#4 durability)", () => {
    const path = temp_db_path();
    const store = new SqliteGraphStore(path);
    store.upsert_node(make_node({ id: "keep", anchor: null }));
    store.upsert_edge(make_edge({ key: "keep_e", layer: "raw" }), [make_prov({ edge_key: "keep_e" })]);
    store.close();

    const reopened = new SqliteGraphStore(path);
    expect(reopened.schema_version()).toBe(CURRENT_SCHEMA_VERSION);
    expect(reopened.all_nodes().map((n) => n.id)).toEqual(["keep"]);
    expect(reopened.all_edges().map((e) => e.key)).toEqual(["keep_e"]);
    expect(reopened.provenance_for_edge("keep_e")).toHaveLength(1);
    reopened.close();
  });

  it("drops a disposable table registered after seeding on a version mismatch", () => {
    const path = temp_db_path();
    new SqliteGraphStore(path).close();

    const raw = new DatabaseSync(path);
    raw.prepare("INSERT INTO table_registry (table_name, disposable) VALUES (?, ?)").run("scratch_cache", 1);
    raw.exec("CREATE TABLE scratch_cache (id TEXT PRIMARY KEY)");
    raw.prepare("INSERT INTO scratch_cache (id) VALUES (?)").run("gone");
    raw.prepare("UPDATE schema_version SET version = ? WHERE id = 1").run(0);
    raw.close();

    new SqliteGraphStore(path).close();

    const check = new DatabaseSync(path);
    const exists = check.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scratch_cache'").get();
    expect(exists).toBeUndefined();
    check.close();
  });
});
