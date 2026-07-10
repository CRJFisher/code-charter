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

  describe("transaction (turn atomicity)", () => {
    it("commits every write made inside the callback", async () => {
      await store.transaction(async () => {
        store.upsert_node(make_node({ id: "f.ts#a" }));
        store.upsert_node(make_node({ id: "f.ts#b" }));
      });
      expect(store.all_nodes().map((n) => n.id).sort()).toEqual(["f.ts#a", "f.ts#b"]);
    });

    it("rolls back every write when the callback throws, leaving the store untouched", async () => {
      store.upsert_node(make_node({ id: "f.ts#pre" }));
      await expect(
        store.transaction(async () => {
          store.upsert_node(make_node({ id: "f.ts#half" }));
          throw new Error("mid-turn failure");
        }),
      ).rejects.toThrow("mid-turn failure");
      // Only the pre-transaction row survives — the half-applied write rolled back as a unit.
      expect(store.all_nodes().map((n) => n.id)).toEqual(["f.ts#pre"]);
    });

    it("is re-entrant: a nested call runs inline within the open transaction", async () => {
      await store.transaction(async () => {
        store.upsert_node(make_node({ id: "f.ts#outer" }));
        await store.transaction(async () => {
          store.upsert_node(make_node({ id: "f.ts#inner" }));
        });
      });
      expect(store.all_nodes().map((n) => n.id).sort()).toEqual(["f.ts#inner", "f.ts#outer"]);
    });

    it("returns the callback's value", async () => {
      const result = await store.transaction(async () => 42);
      expect(result).toBe(42);
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

      // Revival is a later upsert: the wholesale REPLACE lands the row live again.
      store.upsert_node(node);
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

  describe("write_fields layer promotion (AC#1)", () => {
    it("promotes an agentic-layer node to layer='user' when a field is stamped user-owned", () => {
      store.upsert_node(make_node({ id: "n", layer: "agentic" }));
      store.write_fields({ kind: "node", id: "n" }, { description: "hand-written" }, "user");
      expect(store.node("n")?.layer).toBe("user");
      expect(store.node("n")?.field_ownership.description).toBe("user");
    });

    it("survives a rebuild_layer('agentic') whose writer does not re-emit the promoted node", () => {
      store.upsert_node(make_node({ id: "n", layer: "agentic" }));
      store.write_fields({ kind: "node", id: "n" }, { description: "hand-written" }, "user");

      store.rebuild_layer("agentic", () => {
        // The agentic pass does NOT re-emit `n`; without the promotion it would be deleted.
      });

      expect(store.node("n")).toBeDefined();
      expect(store.node("n")?.attributes.description).toBe("hand-written");
      expect(store.node("n")?.layer).toBe("user");
    });

    it("promotes an agentic-layer edge to layer='user' and survives rebuild_layer('agentic')", () => {
      store.upsert_node(make_node({ id: "f.ts#a", layer: "raw" }));
      store.upsert_node(make_node({ id: "g.ts#b", layer: "raw" }));
      store.upsert_edge(make_edge({ key: "e1", layer: "agentic" }), []);
      store.write_fields({ kind: "edge", id: "e1" }, { note: "kept" }, "user");

      const edge_layer = () => store.all_edges().find((e) => e.key === "e1")?.layer;
      expect(edge_layer()).toBe("user");

      store.rebuild_layer("agentic", () => {});
      const survived = store.all_edges().find((e) => e.key === "e1");
      expect(survived).toBeDefined();
      expect(survived?.attributes.note).toBe("kept");
    });

    it("does not change layer on a non-user write or a fully-skipped user write", () => {
      store.upsert_node(make_node({ id: "n", layer: "agentic" }));
      store.write_fields({ kind: "node", id: "n" }, { summary: "agentic-owned" }, "agentic");
      expect(store.node("n")?.layer).toBe("agentic");

      // A user write whose only field is already user-owned still promotes once, then stays put...
      store.write_fields({ kind: "node", id: "n" }, { summary: "mine" }, "user");
      expect(store.node("n")?.layer).toBe("user");
      // ...and a subsequent lower-tier write is skipped and never demotes.
      store.write_fields({ kind: "node", id: "n" }, { summary: "raw-attempt" }, "raw");
      expect(store.node("n")?.layer).toBe("user");
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
    it("soft-deletes, hides, reveals via include_deleted; a later upsert revives an edge", () => {
      store.upsert_edge(make_edge({ key: "e.user", layer: "user" }), []);
      store.soft_delete({ kind: "edge", id: "e.user" });
      expect(store.all_edges().map((e) => e.key)).toEqual([]);
      expect(store.all_edges({ include_deleted: true }).map((e) => e.key)).toEqual(["e.user"]);
      store.upsert_edge(make_edge({ key: "e.user", layer: "user" }), []);
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

describe("watermark ladder + tiered rebuild (task-27.0.2)", () => {
  let store: SqliteGraphStore;

  beforeEach(() => {
    store = new SqliteGraphStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  describe("ladder matrix: owner tier × writing pass (AC#1, AC#2, AC#6)", () => {
    // Establish a field owned by `owner`, then attempt to rewrite it from a pass at `as_tier`.
    // The write lands iff TIER_RANK[owner] <= TIER_RANK[as_tier]; otherwise it is skipped and
    // the field is left unchanged. An "absent" owner is the raw-owned (rank 0) default.
    const TIERS = ["raw", "agentic", "user"] as const;
    const RANK: Record<(typeof TIERS)[number], number> = { raw: 0, agentic: 1, user: 2 };

    function establish_owner(id: string, owner: "raw" | "agentic" | "user" | "absent"): void {
      store.upsert_node(make_node({ id, anchor: null }));
      if (owner === "absent") return; // a field absent from field_ownership is raw-owned (AC#1)
      store.write_fields({ kind: "node", id }, { f: `${owner}-value` }, owner);
    }

    for (const owner of ["absent", ...TIERS] as const) {
      for (const as_tier of TIERS) {
        const owner_rank = owner === "absent" ? 0 : RANK[owner];
        const should_write = owner_rank <= RANK[as_tier];
        it(`${owner}-owned field, ${as_tier}-pass → ${should_write ? "overwrites + restamps" : "skips"}`, () => {
          const id = `n.${owner}.${as_tier}`;
          establish_owner(id, owner);
          const result = store.write_fields({ kind: "node", id }, { f: `${as_tier}-value` }, as_tier);
          const node = store.node(id);
          if (should_write) {
            expect(result.skipped).toEqual([]);
            expect(node?.attributes.f).toBe(`${as_tier}-value`);
            expect(node?.field_ownership.f).toBe(as_tier); // restamped to the writing tier
          } else {
            expect(result.skipped).toEqual(["f"]);
            expect(node?.attributes.f).toBe(owner === "absent" ? undefined : `${owner}-value`);
            expect(node?.field_ownership.f).toBe(owner); // ownership untouched
          }
        });
      }
    }
  });

  describe("dual-sourced description: raw-absent → agentic → user (AC#2)", () => {
    it("stamps an agentic-generated description agentic-owned, lets a user edit promote it, then preserves it against both a raw re-parse and an agentic pass", () => {
      store.upsert_node(make_node({ id: "fn", anchor: null }));
      // description starts absent (raw-owned by default), not pre-stamped
      expect(store.node("fn")?.field_ownership.description).toBeUndefined();

      // agentic pass generates the default — stamped agentic-owned, NOT left raw-owned
      store.write_fields({ kind: "node", id: "fn" }, { description: "agentic default" }, "agentic");
      expect(store.node("fn")?.field_ownership.description).toBe("agentic");

      // user edit promotes it to user-owned
      store.write_fields({ kind: "node", id: "fn" }, { description: "hand-written" }, "user");
      expect(store.node("fn")?.field_ownership.description).toBe("user");

      // a raw re-parse cannot touch it
      expect(store.write_fields({ kind: "node", id: "fn" }, { description: "raw" }, "raw").skipped).toEqual([
        "description",
      ]);
      // and neither can a later agentic pass
      expect(
        store.write_fields({ kind: "node", id: "fn" }, { description: "agentic again" }, "agentic").skipped,
      ).toEqual(["description"]);

      expect(store.node("fn")?.attributes.description).toBe("hand-written");
      expect(store.node("fn")?.field_ownership.description).toBe("user");
    });
  });

  describe("rebuild_layer preserves higher tiers (AC#3)", () => {
    it("rebuild('raw') nukes raw rows, recreates them, and leaves agentic + user rows untouched", () => {
      store.upsert_node(make_node({ id: "raw_old", layer: "raw", anchor: null }));
      store.upsert_node(make_node({ id: "agentic_n", layer: "agentic", anchor: null }));
      store.upsert_node(make_node({ id: "user_n", layer: "user", anchor: null }));
      store.upsert_edge(make_edge({ key: "raw_e", layer: "raw" }), [make_prov({ edge_key: "raw_e" })]);
      store.upsert_edge(make_edge({ key: "agentic_e", layer: "agentic" }), []);

      store.rebuild_layer("raw", (s) => {
        s.upsert_node(make_node({ id: "raw_new", layer: "raw", anchor: null }));
      });

      expect(new Set(store.all_nodes().map((n) => n.id))).toEqual(new Set(["raw_new", "agentic_n", "user_n"]));
      expect(store.all_edges().map((e) => e.key)).toEqual(["agentic_e"]); // only the raw edge was nuked
      expect(store.provenance_for_edge("raw_e")).toEqual([]); // FK ON DELETE CASCADE fires inside the rebuild txn
    });

    it("rebuild('agentic') nukes agentic rows but leaves user rows untouched", () => {
      store.upsert_node(make_node({ id: "raw_n", layer: "raw", anchor: null }));
      store.upsert_node(make_node({ id: "agentic_old", layer: "agentic", anchor: null }));
      store.upsert_node(make_node({ id: "user_n", layer: "user", anchor: null }));

      store.rebuild_layer("agentic", (s) => {
        s.upsert_node(make_node({ id: "agentic_new", layer: "agentic", anchor: null }));
      });

      expect(new Set(store.all_nodes().map((n) => n.id))).toEqual(new Set(["raw_n", "agentic_new", "user_n"]));
    });

    it("preserves a higher-tier-owned field on a surviving row the writer rewrites — via the write_fields ladder, no re-check in rebuild_layer", () => {
      // An agentic-layer node survives rebuild('raw'); it carries a user-owned label and an
      // agentic-owned description. The raw re-parse writer rewrites both through write_fields.
      store.upsert_node(make_node({ id: "carrier", layer: "agentic", anchor: null }));
      store.write_fields({ kind: "node", id: "carrier" }, { label: "user-label" }, "user");
      store.write_fields({ kind: "node", id: "carrier" }, { description: "agentic-desc" }, "agentic");

      store.rebuild_layer("raw", (s) => {
        const { skipped } = s.write_fields(
          { kind: "node", id: "carrier" },
          { label: "raw-label", description: "raw-desc" },
          "raw",
        );
        expect(new Set(skipped)).toEqual(new Set(["label", "description"]));
      });

      const carrier = store.node("carrier");
      expect(carrier?.attributes.label).toBe("user-label");
      expect(carrier?.attributes.description).toBe("agentic-desc");
    });

    it("an agentic-owned field is overwritten by an agentic pass while a user-owned field on the same row survives", () => {
      // A user-layer node survives rebuild('agentic'); the agentic pass rewrites both fields.
      store.upsert_node(make_node({ id: "row", layer: "user", anchor: null }));
      store.write_fields({ kind: "node", id: "row" }, { description: "agentic-desc" }, "agentic");
      store.write_fields({ kind: "node", id: "row" }, { label: "user-label" }, "user");

      store.rebuild_layer("agentic", (s) => {
        const { skipped } = s.write_fields(
          { kind: "node", id: "row" },
          { description: "fresh-agentic", label: "agentic-label" },
          "agentic",
        );
        expect(skipped).toEqual(["label"]); // user-owned label is protected; description is not
      });

      const row = store.node("row");
      expect(row?.attributes.description).toBe("fresh-agentic");
      expect(row?.attributes.label).toBe("user-label");
    });

    it("protects a higher-tier-owned field on a surviving EDGE the writer rewrites (the {kind:'edge'} ladder branch)", () => {
      store.upsert_edge(make_edge({ key: "carrier_e", layer: "user" }), []);
      store.write_fields({ kind: "edge", id: "carrier_e" }, { note: "user-note" }, "user");

      store.rebuild_layer("agentic", (s) => {
        const { skipped } = s.write_fields({ kind: "edge", id: "carrier_e" }, { note: "agentic-note" }, "agentic");
        expect(skipped).toEqual(["note"]);
      });

      expect(store.all_edges().find((e) => e.key === "carrier_e")?.attributes.note).toBe("user-note");
    });
  });

  describe("rebuild_layer consults table_disposition() as data (AC#4)", () => {
    it("calls table_disposition() rather than a hard-coded name list on every rebuild", () => {
      const spy = jest.spyOn(store, "table_disposition");
      store.rebuild_layer("raw", () => {});
      store.rebuild_layer("agentic", () => {});
      expect(spy).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    });

    it("clears exactly the tables the returned data marks disposable — the data drives the DELETE", () => {
      // A user-layer node survives the layer-scoped delete of an agentic rebuild. But if the
      // disposition data marks `nodes` disposable, the registry-driven clear loop deletes it —
      // proving the loop honors the returned flag rather than a hard-coded name. This would fail
      // if rebuild ignored the data (the user node would survive).
      store.upsert_node(make_node({ id: "survivor", layer: "user", anchor: null }));
      const spy = jest.spyOn(store, "table_disposition").mockReturnValue([{ table: "nodes", disposable: true }]);
      store.rebuild_layer("agentic", () => {});
      expect(store.all_nodes()).toEqual([]); // cleared only because the data said nodes is disposable
      spy.mockRestore();
    });
  });

  describe("rebuild_layer leaves soft-deleted higher-tier rows intact (AC#5)", () => {
    it("does not hard-delete or un-flag a soft-deleted agentic row; revival is a later upsert", () => {
      store.upsert_node(make_node({ id: "gone", layer: "agentic", anchor: null }));
      store.soft_delete({ kind: "node", id: "gone" });
      const deleted_at = store.all_nodes({ include_deleted: true }).find((n) => n.id === "gone")?.deleted_at;
      expect(deleted_at).not.toBeNull();

      store.rebuild_layer("agentic", () => {});

      // still present, still soft-deleted (flag untouched), and still hidden from the live read
      expect(store.node("gone")).toBeUndefined();
      const after = store.all_nodes({ include_deleted: true }).find((n) => n.id === "gone");
      expect(after?.deleted_at).toBe(deleted_at);

      store.upsert_node(make_node({ id: "gone", layer: "agentic", anchor: null }));
      expect(store.node("gone")?.id).toBe("gone");
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

  it("rebuild_layer clears every disposable cache (incl. one registered after seeding) as data, preserving the tables themselves and registered-preserved caches (AC#3, AC#4)", () => {
    const path = temp_db_path();
    const store = new SqliteGraphStore(path);
    store.upsert_node(make_node({ id: "raw_n", layer: "raw", anchor: null }));
    store.upsert_node(make_node({ id: "agentic_n", layer: "agentic", anchor: null }));
    store.close();

    // seed three caches out-of-band: the built-in disposable one, a SECOND disposable table
    // registered after seeding, and a preserved (disposable=0) table — proving rebuild clears
    // exactly the tables the registry data marks disposable, not a hard-coded name.
    const seed = new DatabaseSync(path);
    seed.prepare("INSERT INTO anchor_resolution (anchor, status, resolved_at) VALUES (?, ?, ?)").run("a:h", "hit", "t");
    seed.exec("CREATE TABLE scratch_cache (id TEXT PRIMARY KEY)");
    seed.prepare("INSERT INTO table_registry (table_name, disposable) VALUES (?, ?)").run("scratch_cache", 1);
    seed.prepare("INSERT INTO scratch_cache (id) VALUES (?)").run("clear-me");
    seed.exec("CREATE TABLE kept_cache (id TEXT PRIMARY KEY)");
    seed.prepare("INSERT INTO table_registry (table_name, disposable) VALUES (?, ?)").run("kept_cache", 0);
    seed.prepare("INSERT INTO kept_cache (id) VALUES (?)").run("keep-me");
    seed.close();

    const reopened = new SqliteGraphStore(path);
    reopened.rebuild_layer("raw", () => {});
    expect(reopened.all_nodes().map((n) => n.id)).toEqual(["agentic_n"]); // raw nuked, agentic preserved
    reopened.close();

    const check = new DatabaseSync(path);
    // both disposable caches emptied but their tables still exist (DELETE, not DROP)
    expect((check.prepare("SELECT COUNT(*) AS n FROM anchor_resolution").get() as { n: number }).n).toBe(0);
    expect((check.prepare("SELECT COUNT(*) AS n FROM scratch_cache").get() as { n: number }).n).toBe(0);
    // the registered-preserved cache survives untouched
    expect(check.prepare("SELECT id FROM kept_cache").all()).toEqual([{ id: "keep-me" }]);
    check.close();
  });

  it("rolls back the disposable-cache clear when the rebuild writer throws (AC#3 atomicity)", () => {
    const path = temp_db_path();
    new SqliteGraphStore(path).close();

    const seed = new DatabaseSync(path);
    seed.prepare("INSERT INTO anchor_resolution (anchor, status, resolved_at) VALUES (?, ?, ?)").run("a:h", "hit", "t");
    seed.close();

    const store = new SqliteGraphStore(path);
    store.upsert_node(make_node({ id: "raw_n", layer: "raw", anchor: null }));
    expect(() =>
      store.rebuild_layer("raw", () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    // both the row delete and the cache clear are rolled back together
    expect(store.all_nodes().map((n) => n.id)).toEqual(["raw_n"]);
    store.close();

    const check = new DatabaseSync(path);
    expect((check.prepare("SELECT COUNT(*) AS n FROM anchor_resolution").get() as { n: number }).n).toBe(1);
    check.close();
  });

  describe("concurrency discipline (task-27.1.20.1)", () => {
    it("sets journal_mode=wal on a fresh store", () => {
      const path = temp_db_path();
      new SqliteGraphStore(path).close();

      // WAL is persisted in the file header, so a fresh raw connection observes it.
      const raw = new DatabaseSync(path);
      expect(raw.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
      raw.close();
    });

    it("sets busy_timeout=5000 on its own connection", () => {
      // busy_timeout is per-connection state with no seam from a second connection, so this reads
      // the pragma back through the store's private handle (bracket access is the deliberate
      // test-only escape hatch) rather than adding a production accessor for one assertion.
      const store = new SqliteGraphStore(temp_db_path());
      const db = store["db"];
      expect(db.prepare("PRAGMA busy_timeout").get()).toEqual({ timeout: 5000 });
      store.close();
    });

    it("upgrades an existing rollback-journal db to WAL on open", () => {
      const path = temp_db_path();
      const raw = new DatabaseSync(path);
      raw.exec("PRAGMA journal_mode = DELETE");
      raw.exec("CREATE TABLE probe (x)");
      raw.close();

      new SqliteGraphStore(path).close();

      const check = new DatabaseSync(path);
      expect(check.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
      check.close();
    });

    it("two writer stores on the same path coexist", () => {
      const path = temp_db_path();
      const a = new SqliteGraphStore(path);
      a.upsert_node(make_node({ id: "from_a", anchor: null }));
      const b = new SqliteGraphStore(path);
      b.upsert_node(make_node({ id: "from_b", anchor: null }));
      expect(new Set(b.all_nodes().map((n) => n.id))).toEqual(new Set(["from_a", "from_b"]));
      a.close();
      b.close();
    });

    it("a read-only store snapshots the nodes and edges a writer persisted", () => {
      const path = temp_db_path();
      const writer = new SqliteGraphStore(path);
      writer.upsert_node(make_node({ id: "n", anchor: null }));
      writer.upsert_edge(make_edge({ key: "e" }), [make_prov({ edge_key: "e" })]);
      writer.close();

      const reader = new SqliteGraphStore(path, { read_only: true });
      const snap = reader.snapshot();
      expect(snap.nodes.map((n) => n.id)).toEqual(["n"]);
      expect(snap.edges.map((e) => e.key)).toEqual(["e"]);
      reader.close();
    });

    it("a read-only open on a missing db file throws", () => {
      // Documents the contract the extension's existsSync guard is load-bearing for: a read-only
      // connection cannot create the file.
      expect(() => new SqliteGraphStore(temp_db_path(), { read_only: true })).toThrow();
    });

    it("a read-only store rejects writes", () => {
      const path = temp_db_path();
      new SqliteGraphStore(path).close();

      const reader = new SqliteGraphStore(path, { read_only: true });
      expect(() => reader.upsert_node(make_node({ anchor: null }))).toThrow();
      reader.close();
    });

    it("open_graph_store threads read_only through to the store", () => {
      const path = temp_db_path();
      const writer = open_graph_store(path);
      writer.upsert_node(make_node({ id: "n", anchor: null }));
      writer.close();

      const reader = open_graph_store(path, { read_only: true });
      expect(reader.snapshot().nodes.map((n) => n.id)).toEqual(["n"]);
      expect(() => reader.upsert_node(make_node({ id: "n2", anchor: null }))).toThrow();
      reader.close();
    });

    it("snapshot pins one read transaction across both reads while a writer commits", () => {
      const path = temp_db_path();
      const writer = new SqliteGraphStore(path);
      writer.upsert_node(make_node({ id: "before", anchor: null }));

      // A reader whose all_nodes() triggers a concurrent commit mid-snapshot: if snapshot() ran
      // its two reads as separate autocommit statements, the edge committed between them would
      // surface — the torn pair AC#2 forbids.
      class MidSnapshotCommit extends SqliteGraphStore {
        all_nodes(opts?: { include_deleted?: boolean }): NodeRow[] {
          const rows = super.all_nodes(opts);
          writer.upsert_node(make_node({ id: "mid_read", anchor: null }));
          writer.upsert_edge(make_edge({ key: "torn" }), [make_prov({ edge_key: "torn" })]);
          return rows;
        }
      }
      const reader = new MidSnapshotCommit(path, { read_only: true });
      const snap = reader.snapshot();
      expect(snap.nodes.map((n) => n.id)).toEqual(["before"]);
      expect(snap.edges).toEqual([]);
      // A fresh read after the snapshot's transaction closed sees the mid-snapshot commit.
      expect(reader.all_edges().map((e) => e.key)).toEqual(["torn"]);
      reader.close();
      writer.close();
    });
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
