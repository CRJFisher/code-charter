import type {
  EdgeRow,
  GraphStore,
  GraphTarget,
  NodeRow,
  ProvenanceRow,
  Tier,
} from "@code-charter/types";

import { SqliteGraphStore } from "../storage/sqlite_graph_store";
import { CustomGraphModel, graph_to_rows } from "./custom_graph_model";

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

type WriteCall =
  | { method: "upsert_node"; id: string }
  | { method: "upsert_edge"; key: string; provenance: ProvenanceRow[] }
  | { method: "write_fields"; target: GraphTarget; fields: Record<string, unknown>; as_tier: Tier }
  | { method: "soft_delete"; target: GraphTarget };

/**
 * A GraphStore that delegates everything to a real store but records each write call, so a test can
 * assert exactly which rows were flushed (and that untouched rows were never written).
 */
class RecordingStore implements GraphStore {
  readonly writes: WriteCall[] = [];

  constructor(private readonly inner: GraphStore) {}

  all_nodes(opts?: { include_deleted?: boolean }): NodeRow[] {
    return this.inner.all_nodes(opts);
  }
  all_edges(opts?: { include_deleted?: boolean }): EdgeRow[] {
    return this.inner.all_edges(opts);
  }
  snapshot(): { nodes: NodeRow[]; edges: EdgeRow[] } {
    return this.inner.snapshot();
  }
  provenance_for_edge(edge_key: string): ProvenanceRow[] {
    return this.inner.provenance_for_edge(edge_key);
  }
  upsert_node(row: NodeRow): void {
    this.writes.push({ method: "upsert_node", id: row.id });
    this.inner.upsert_node(row);
  }
  upsert_edge(row: EdgeRow, provenance: ProvenanceRow[]): void {
    this.writes.push({ method: "upsert_edge", key: row.key, provenance });
    this.inner.upsert_edge(row, provenance);
  }
  write_fields(target: GraphTarget, fields: Record<string, unknown>, as_tier: Tier): { skipped: string[] } {
    this.writes.push({ method: "write_fields", target, fields, as_tier });
    return this.inner.write_fields(target, fields, as_tier);
  }
  node(id: string): NodeRow | undefined {
    return this.inner.node(id);
  }
  neighborhood(id: string, depth: number): { nodes: NodeRow[]; edges: EdgeRow[] } {
    return this.inner.neighborhood(id, depth);
  }
  edges_for_files(paths: string[]): EdgeRow[] {
    return this.inner.edges_for_files(paths);
  }
  record_file_hash(path: string): void {
    this.inner.record_file_hash(path);
  }
  file_changed_since_recorded(path: string): boolean {
    return this.inner.file_changed_since_recorded(path);
  }
  invalidate_edges_for_files(paths: string[]): void {
    this.inner.invalidate_edges_for_files(paths);
  }
  invalidate_nodes_for_files(paths: string[]): void {
    this.inner.invalidate_nodes_for_files(paths);
  }
  soft_delete(target: GraphTarget): void {
    this.writes.push({ method: "soft_delete", target });
    this.inner.soft_delete(target);
  }
  table_disposition(): Array<{ table: string; disposable: boolean }> {
    return this.inner.table_disposition();
  }
  rebuild_layer(layer: "raw" | "agentic", write: (s: GraphStore) => void): void {
    this.inner.rebuild_layer(layer, write);
  }
  schema_version(): number {
    return this.inner.schema_version();
  }
  close(): void {
    this.inner.close();
  }
}

describe("CustomGraphModel", () => {
  let store: SqliteGraphStore;

  beforeEach(() => {
    store = new SqliteGraphStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  describe("hydrate (AC#1)", () => {
    it("hydrates every node and edge including soft-deleted, keyed by id / edge key", () => {
      store.upsert_node(make_node({ id: "n.live", layer: "raw" }));
      store.upsert_node(make_node({ id: "n.dead", layer: "agentic" }));
      store.soft_delete({ kind: "node", id: "n.dead" });
      store.upsert_edge(make_edge({ key: "e.live", src_id: "n.live", dst_id: "n.dead" }), []);

      const model = CustomGraphModel.hydrate(store);

      expect(model.has_node("n.live")).toBe(true);
      expect(model.has_node("n.dead")).toBe(true); // soft-deleted but held in memory
      expect(model.has_edge("e.live")).toBe(true);
      expect(model.node_row("n.dead")?.deleted_at).not.toBeNull();
    });

    it("reconstructs rows equal to the store rows, nested JSON and all", () => {
      const node = make_node({
        id: "n1",
        layer: "agentic",
        attributes: { description: "does x", members: ["a", "b"], meta: { n: 1 } },
        field_ownership: { description: "agentic", label: "user" },
        origin: "agent.summary",
        intent_source: "diagram-edit",
      });
      const edge = make_edge({ key: "e1", src_id: "n1", dst_id: "n1", confidence: 0.5, adjudication: "rejected", layer: "agentic" });
      store.upsert_node(node);
      store.upsert_edge(edge, [make_prov({ edge_key: "e1" })]);

      const model = CustomGraphModel.hydrate(store);

      expect(model.node_row("n1")).toEqual(node);
      expect(model.edge_row("e1")).toEqual(edge);
    });

    it("preserves distinct deterministic edge keys for parallel edges between the same nodes", () => {
      store.upsert_node(make_node({ id: "a" }));
      store.upsert_node(make_node({ id: "b" }));
      store.upsert_edge(make_edge({ key: "calls", src_id: "a", dst_id: "b", kind: "code.calls" }), []);
      store.upsert_edge(make_edge({ key: "doc", src_id: "a", dst_id: "b", kind: "code.literal-doc" }), []);

      const model = CustomGraphModel.hydrate(store);

      expect(model.edge_row("calls")?.kind).toBe("code.calls");
      expect(model.edge_row("doc")?.kind).toBe("code.literal-doc");
    });
  });

  describe("flush routing (AC#1)", () => {
    it("routes a field-level edit through write_fields only", () => {
      store.upsert_node(make_node({ id: "n1" }));
      const recording = new RecordingStore(store);
      const model = CustomGraphModel.hydrate(recording);

      model.write_fields({ kind: "node", id: "n1" }, { label: "mine" }, "user");
      model.flush();

      expect(recording.writes).toEqual([
        { method: "write_fields", target: { kind: "node", id: "n1" }, fields: { label: "mine" }, as_tier: "user" },
      ]);
      expect(store.node("n1")?.attributes.label).toBe("mine");
    });

    it("honors the ladder: a raw edit is skipped when a user owns the field; a user edit wins", () => {
      store.upsert_node(make_node({ id: "n1" }));
      const model = CustomGraphModel.hydrate(store);

      expect(model.write_fields({ kind: "node", id: "n1" }, { label: "mine" }, "user").skipped).toEqual([]);
      const raw_attempt = model.write_fields({ kind: "node", id: "n1" }, { label: "auto" }, "raw");
      expect(raw_attempt.skipped).toEqual(["label"]);
      expect(model.node_row("n1")?.attributes.label).toBe("mine");

      model.flush();
      expect(store.node("n1")?.attributes.label).toBe("mine");
      expect(store.node("n1")?.field_ownership.label).toBe("user");
    });

    it("routes a full raw node through upsert_node and writes only the changed node", () => {
      store.upsert_node(make_node({ id: "a", kind: "code.function" }));
      store.upsert_node(make_node({ id: "b" }));
      const recording = new RecordingStore(store);
      const model = CustomGraphModel.hydrate(recording);
      const before_b = store.node("b");

      const a = model.node_row("a")!;
      model.upsert_node({ ...a, kind: "code.method", anchor: "f.ts/a:hash2" });
      model.flush();

      expect(recording.writes).toEqual([{ method: "upsert_node", id: "a" }]);
      expect(store.node("a")?.kind).toBe("code.method");
      expect(store.node("b")).toEqual(before_b);
    });

    it("routes a full raw edge through upsert_edge with its provenance round-tripping", () => {
      store.upsert_node(make_node({ id: "a" }));
      store.upsert_node(make_node({ id: "b" }));
      const recording = new RecordingStore(store);
      const model = CustomGraphModel.hydrate(recording);

      const provenance = [make_prov({ edge_key: "e1", source_file: "a.ts" }), make_prov({ edge_key: "e1", source_file: "b.ts" })];
      model.upsert_edge(make_edge({ key: "e1", src_id: "a", dst_id: "b" }), provenance);
      model.flush();

      const edge_writes = recording.writes.filter((w) => w.method === "upsert_edge");
      expect(edge_writes).toHaveLength(1);
      expect(store.provenance_for_edge("e1")).toEqual(provenance);
    });

    it("routes a soft-delete through soft_delete, never re-serializing other rows", () => {
      store.upsert_node(make_node({ id: "a", layer: "agentic" }));
      store.upsert_node(make_node({ id: "b" }));
      const recording = new RecordingStore(store);
      const model = CustomGraphModel.hydrate(recording);

      model.soft_delete({ kind: "node", id: "a" });
      model.flush();

      expect(recording.writes).toEqual([{ method: "soft_delete", target: { kind: "node", id: "a" } }]);
      expect(store.node("a")).toBeUndefined(); // hidden from live reads
      expect(store.all_nodes({ include_deleted: true }).map((n) => n.id).sort()).toEqual(["a", "b"]);
    });

    it("flushes only changed rows — untouched rows are not written, and a no-op flush writes nothing", () => {
      store.upsert_node(make_node({ id: "a" }));
      store.upsert_node(make_node({ id: "b" }));
      store.upsert_node(make_node({ id: "c" }));
      const recording = new RecordingStore(store);
      const model = CustomGraphModel.hydrate(recording);

      model.flush();
      expect(recording.writes).toEqual([]);

      model.write_fields({ kind: "node", id: "b" }, { label: "x" }, "user");
      model.flush();
      expect(recording.writes).toHaveLength(1);
      expect(recording.writes[0].method).toBe("write_fields");
    });

    it("routes a field-level edit on an EDGE through write_fields, ladder-respecting", () => {
      store.upsert_node(make_node({ id: "a" }));
      store.upsert_node(make_node({ id: "b" }));
      store.upsert_edge(make_edge({ key: "e1", src_id: "a", dst_id: "b", layer: "agentic" }), []);
      const recording = new RecordingStore(store);
      const model = CustomGraphModel.hydrate(recording);

      expect(model.write_fields({ kind: "edge", id: "e1" }, { note: "why" }, "user").skipped).toEqual([]);
      expect(model.edge_row("e1")?.attributes.note).toBe("why");
      model.flush();

      expect(recording.writes).toEqual([
        { method: "write_fields", target: { kind: "edge", id: "e1" }, fields: { note: "why" }, as_tier: "user" },
      ]);
      expect(store.all_edges()[0].attributes.note).toBe("why");
    });

    it("groups multi-tier field edits on one target into one write_fields call per tier", () => {
      store.upsert_node(make_node({ id: "n1" }));
      const recording = new RecordingStore(store);
      const model = CustomGraphModel.hydrate(recording);

      model.write_fields({ kind: "node", id: "n1" }, { auto: "a" }, "agentic");
      model.write_fields({ kind: "node", id: "n1" }, { label: "u" }, "user");
      model.flush();

      const field_writes = recording.writes.filter(
        (w): w is Extract<WriteCall, { method: "write_fields" }> => w.method === "write_fields",
      );
      expect(field_writes).toHaveLength(2);
      const by_tier = new Map(field_writes.map((w) => [w.as_tier, w.fields]));
      expect(by_tier.get("agentic")).toEqual({ auto: "a" });
      expect(by_tier.get("user")).toEqual({ label: "u" });
    });

    it("a full-row upsert supersedes a pending field edit on the same target (store matches memory)", () => {
      store.upsert_node(make_node({ id: "n1", attributes: { x: "old" } }));
      const recording = new RecordingStore(store);
      const model = CustomGraphModel.hydrate(recording);

      model.write_fields({ kind: "node", id: "n1" }, { x: "edited" }, "user");
      model.upsert_node(make_node({ id: "n1", attributes: {}, field_ownership: {} }));
      model.flush();

      // The wholesale upsert wins in memory; the stale field edit must NOT be replayed to the store.
      expect(model.node_row("n1")?.attributes).toEqual({});
      expect(store.node("n1")?.attributes).toEqual({});
      expect(recording.writes).toEqual([{ method: "upsert_node", id: "n1" }]);
    });

    it("a full-row upsert supersedes a pending soft-delete on the same target", () => {
      store.upsert_node(make_node({ id: "n1", layer: "agentic" }));
      const recording = new RecordingStore(store);
      const model = CustomGraphModel.hydrate(recording);

      model.soft_delete({ kind: "node", id: "n1" });
      model.upsert_node(make_node({ id: "n1", layer: "agentic", deleted_at: null }));
      model.flush();

      expect(model.node_row("n1")?.deleted_at).toBeNull();
      expect(store.node("n1")).toBeDefined(); // live, not tombstoned
      expect(recording.writes).toEqual([{ method: "upsert_node", id: "n1" }]);
    });

    it("re-upserts an existing edge through upsert_edge, replacing the row and its provenance", () => {
      store.upsert_node(make_node({ id: "a" }));
      store.upsert_node(make_node({ id: "b" }));
      store.upsert_edge(make_edge({ key: "e1", src_id: "a", dst_id: "b", confidence: 1 }), [
        make_prov({ edge_key: "e1", source_file: "old.ts" }),
      ]);
      const recording = new RecordingStore(store);
      const model = CustomGraphModel.hydrate(recording);

      const new_prov = [make_prov({ edge_key: "e1", source_file: "new.ts" })];
      model.upsert_edge({ ...model.edge_row("e1")!, confidence: 0.5 }, new_prov);
      model.flush();

      expect(model.edge_row("e1")?.confidence).toBe(0.5);
      expect(store.all_edges()[0].confidence).toBe(0.5);
      expect(store.provenance_for_edge("e1")).toEqual(new_prov);
    });

    it("write_fields and soft_delete on an unknown target are no-ops", () => {
      const recording = new RecordingStore(store);
      const model = CustomGraphModel.hydrate(recording);

      expect(model.write_fields({ kind: "node", id: "ghost" }, { x: 1 }, "user")).toEqual({ skipped: [] });
      model.soft_delete({ kind: "edge", id: "ghost" });
      model.flush();

      expect(recording.writes).toEqual([]);
    });
  });

  describe("layer promotion (AC#1)", () => {
    it("promotes an agentic-layer node to layer='user' in memory and persists it through flush", () => {
      store.upsert_node(make_node({ id: "n", layer: "agentic" }));
      const model = CustomGraphModel.hydrate(store);

      model.write_fields({ kind: "node", id: "n" }, { description: "hand-written" }, "user");
      expect(model.node_row("n")?.layer).toBe("user");

      model.flush();
      expect(store.node("n")?.layer).toBe("user");
      expect(store.node("n")?.field_ownership.description).toBe("user");
    });

    it("renders the promoted node correctly and survives a later agentic rebuild", () => {
      store.upsert_node(make_node({ id: "n", layer: "agentic" }));
      const model = CustomGraphModel.hydrate(store);
      model.write_fields({ kind: "node", id: "n" }, { description: "hand-written" }, "user");
      model.flush();

      // The agentic pass re-runs without re-emitting `n`; the promotion vacated it from the agentic layer.
      store.rebuild_layer("agentic", () => {});

      const view = CustomGraphModel.hydrate(store).render([{ kind: "raw" }, { kind: "agentic" }, { kind: "user" }]);
      expect(view.hasNode("n")).toBe(true);
      expect(view.getNodeAttributes("n").row.attributes.description).toBe("hand-written");
    });

    it("does not promote on an agentic write", () => {
      store.upsert_node(make_node({ id: "n", layer: "agentic" }));
      const model = CustomGraphModel.hydrate(store);
      model.write_fields({ kind: "node", id: "n" }, { summary: "auto" }, "agentic");
      expect(model.node_row("n")?.layer).toBe("agentic");
      model.flush();
      expect(store.node("n")?.layer).toBe("agentic");
    });
  });

  describe("soft-delete by convention (AC#2)", () => {
    it("keeps a soft-deleted row in memory, reconstructable with deleted_at set", () => {
      store.upsert_node(make_node({ id: "a", layer: "agentic" }));
      const model = CustomGraphModel.hydrate(store);

      model.soft_delete({ kind: "node", id: "a" });

      expect(model.has_node("a")).toBe(true);
      expect(model.node_row("a")?.deleted_at).not.toBeNull();
    });

    it("filters soft-deleted rows at render by default but includes them with show_tombstones", () => {
      store.upsert_node(make_node({ id: "a", layer: "agentic" }));
      const model = CustomGraphModel.hydrate(store);
      model.soft_delete({ kind: "node", id: "a" });

      expect(model.render([{ kind: "agentic" }]).hasNode("a")).toBe(false);
      expect(model.render([{ kind: "agentic" }], { show_tombstones: true }).hasNode("a")).toBe(true);
    });

    it("is a no-op on raw rows, mirroring the store", () => {
      store.upsert_node(make_node({ id: "a", layer: "raw" }));
      const recording = new RecordingStore(store);
      const model = CustomGraphModel.hydrate(recording);

      model.soft_delete({ kind: "node", id: "a" });
      model.flush();

      expect(recording.writes).toEqual([]);
      expect(model.node_row("a")?.deleted_at).toBeNull();
      expect(model.render([{ kind: "raw" }]).hasNode("a")).toBe(true);
    });

    it("soft-deletes an EDGE by convention: held in memory, filtered at render unless show_tombstones", () => {
      store.upsert_node(make_node({ id: "a", layer: "raw" }));
      store.upsert_node(make_node({ id: "b", layer: "raw" }));
      store.upsert_edge(make_edge({ key: "e", src_id: "a", dst_id: "b", layer: "agentic" }), []);
      const recording = new RecordingStore(store);
      const model = CustomGraphModel.hydrate(recording);

      model.soft_delete({ kind: "edge", id: "e" });
      expect(model.edge_row("e")?.deleted_at).not.toBeNull();
      model.flush();

      expect(recording.writes).toEqual([{ method: "soft_delete", target: { kind: "edge", id: "e" } }]);
      // Endpoints stay live, so the tombstoned edge is hidden by default and surfaced with the flag.
      expect(model.render([{ kind: "raw" }, { kind: "agentic" }]).hasEdge("e")).toBe(false);
      expect(model.render([{ kind: "raw" }, { kind: "agentic" }], { show_tombstones: true }).hasEdge("e")).toBe(true);
    });

    it("is a no-op on raw EDGES, mirroring the store", () => {
      store.upsert_node(make_node({ id: "a", layer: "raw" }));
      store.upsert_node(make_node({ id: "b", layer: "raw" }));
      store.upsert_edge(make_edge({ key: "e", src_id: "a", dst_id: "b", layer: "raw" }), []);
      const recording = new RecordingStore(store);
      const model = CustomGraphModel.hydrate(recording);

      model.soft_delete({ kind: "edge", id: "e" });
      model.flush();

      expect(recording.writes).toEqual([]);
      expect(model.edge_row("e")?.deleted_at).toBeNull();
    });
  });

  describe("render fold (AC#3)", () => {
    it("includes each base-layer row once when ids do not collide across layers", () => {
      store.upsert_node(make_node({ id: "r", layer: "raw" }));
      store.upsert_node(make_node({ id: "g", layer: "agentic" }));
      store.upsert_node(make_node({ id: "u", layer: "user" }));
      const model = CustomGraphModel.hydrate(store);

      const view = model.render([{ kind: "raw" }, { kind: "agentic" }, { kind: "user" }]);

      expect(view.nodes().sort()).toEqual(["g", "r", "u"]);
    });

    it("folds list-order last-wins at field granularity: a later layer overrides one field, others survive", () => {
      store.upsert_node(make_node({ id: "n", layer: "raw", attributes: { label: "raw-label", description: "raw-desc" } }));
      const model = CustomGraphModel.hydrate(store);

      const overlay_node = make_node({ id: "n", layer: "user", attributes: { label: "user-label" } });
      const view = model.render([{ kind: "raw" }, { kind: "overlay", rows: { nodes: [overlay_node], edges: [] } }]);

      const merged = view.getNodeAttributes("n").row;
      expect(merged.attributes.label).toBe("user-label"); // later layer wins
      expect(merged.attributes.description).toBe("raw-desc"); // earlier field survives
    });

    it("folds an edge's attribute bag across layers: later wins, earlier field survives", () => {
      store.upsert_node(make_node({ id: "a", layer: "raw" }));
      store.upsert_node(make_node({ id: "b", layer: "raw" }));
      store.upsert_edge(
        make_edge({ key: "e", src_id: "a", dst_id: "b", layer: "raw", attributes: { note: "raw-note", weight: 1 } }),
        [],
      );
      const model = CustomGraphModel.hydrate(store);

      const overlay_edge = make_edge({ key: "e", src_id: "a", dst_id: "b", layer: "user", attributes: { note: "user-note" } });
      const view = model.render([{ kind: "raw" }, { kind: "overlay", rows: { nodes: [], edges: [overlay_edge] } }]);

      const merged = view.getEdgeAttributes("e").row;
      expect(merged.attributes.note).toBe("user-note");
      expect(merged.attributes.weight).toBe(1);
    });

    it("does not consult or stamp field_ownership in the fold", () => {
      // The base row claims user owns `label`, yet a later agentic overlay still wins by list order.
      store.upsert_node(
        make_node({ id: "n", layer: "raw", attributes: { label: "base" }, field_ownership: { label: "user" } }),
      );
      const model = CustomGraphModel.hydrate(store);

      const overlay_node = make_node({ id: "n", layer: "agentic", attributes: { label: "overlaid" } });
      const view = model.render([{ kind: "raw" }, { kind: "overlay", rows: { nodes: [overlay_node], edges: [] } }]);

      const merged = view.getNodeAttributes("n").row;
      expect(merged.attributes.label).toBe("overlaid");
      expect(merged.field_ownership).toEqual({}); // view carries no ownership
    });

    it("drops an edge whose endpoint was filtered out", () => {
      store.upsert_node(make_node({ id: "a", layer: "raw" }));
      store.upsert_node(make_node({ id: "b", layer: "agentic" }));
      store.upsert_edge(make_edge({ key: "e", src_id: "a", dst_id: "b", layer: "raw" }), []);
      const model = CustomGraphModel.hydrate(store);
      model.soft_delete({ kind: "node", id: "b" });

      const view = model.render([{ kind: "raw" }, { kind: "agentic" }]);

      expect(view.hasNode("b")).toBe(false);
      expect(view.hasEdge("e")).toBe(false); // endpoint gone -> edge gone
    });

    it("returns a fresh graph that does not mutate the model", () => {
      store.upsert_node(make_node({ id: "a", layer: "raw", attributes: { label: "orig" } }));
      const model = CustomGraphModel.hydrate(store);

      const view = model.render([{ kind: "raw" }]);
      view.getNodeAttributes("a").row.attributes.label = "tampered";
      view.dropNode("a");

      expect(model.has_node("a")).toBe(true);
      expect(model.node_row("a")?.attributes.label).toBe("orig");
    });

    it("renders an empty graph from an empty layer list", () => {
      store.upsert_node(make_node({ id: "a" }));
      const model = CustomGraphModel.hydrate(store);

      const view = model.render([]);

      expect(view.order).toBe(0);
      expect(view.size).toBe(0);
    });

    it("a later layer revives a tombstoned row by overriding deleted_at", () => {
      store.upsert_node(make_node({ id: "n", layer: "agentic", attributes: { label: "kept" } }));
      const model = CustomGraphModel.hydrate(store);
      model.soft_delete({ kind: "node", id: "n" });

      const reviver = make_node({ id: "n", layer: "user", deleted_at: null, attributes: { label: "revived" } });
      const view = model.render([{ kind: "agentic" }, { kind: "overlay", rows: { nodes: [reviver], edges: [] } }]);

      expect(view.hasNode("n")).toBe(true); // revived without show_tombstones
      expect(view.getNodeAttributes("n").row.attributes.label).toBe("revived");
    });

    it("precedence is list order: swapping layer order swaps the winning field value", () => {
      const model = CustomGraphModel.hydrate(store);
      const n_a = make_node({ id: "n", attributes: { label: "a" } });
      const n_b = make_node({ id: "n", attributes: { label: "b" } });

      const ab = model.render([
        { kind: "overlay", rows: { nodes: [n_a], edges: [] } },
        { kind: "overlay", rows: { nodes: [n_b], edges: [] } },
      ]);
      const ba = model.render([
        { kind: "overlay", rows: { nodes: [n_b], edges: [] } },
        { kind: "overlay", rows: { nodes: [n_a], edges: [] } },
      ]);

      expect(ab.getNodeAttributes("n").row.attributes.label).toBe("b");
      expect(ba.getNodeAttributes("n").row.attributes.label).toBe("a");
    });
  });

  describe("proposed overlay composition (AC#4)", () => {
    it("composes a proposed overlay as one more list entry with no signature change", () => {
      store.upsert_node(make_node({ id: "a", layer: "raw", attributes: { label: "base" } }));
      store.upsert_node(make_node({ id: "b", layer: "raw" }));
      store.upsert_edge(make_edge({ key: "e", src_id: "a", dst_id: "b", layer: "raw" }), []);
      const model = CustomGraphModel.hydrate(store);

      const proposed_node = make_node({ id: "a", layer: "user", attributes: { label: "proposed" } });
      const proposed_new = make_node({ id: "c", layer: "user" });
      const proposed_edge = make_edge({ key: "e2", src_id: "a", dst_id: "c", layer: "user" });
      const view = model.render([
        { kind: "raw" },
        { kind: "agentic" },
        { kind: "user" },
        { kind: "overlay", rows: { nodes: [proposed_node, proposed_new], edges: [proposed_edge] } },
      ]);

      expect(view.getNodeAttributes("a").row.attributes.label).toBe("proposed"); // overlay wins
      expect(view.hasNode("c")).toBe(true);
      expect(view.hasEdge("e2")).toBe(true);
    });

    it("never writes overlay rows back to the store", () => {
      store.upsert_node(make_node({ id: "a", layer: "raw" }));
      const recording = new RecordingStore(store);
      const model = CustomGraphModel.hydrate(recording);
      const before = store.all_nodes({ include_deleted: true });

      model.render([
        { kind: "raw" },
        { kind: "overlay", rows: { nodes: [make_node({ id: "ghost", layer: "user" })], edges: [] } },
      ]);

      expect(recording.writes).toEqual([]);
      expect(store.all_nodes({ include_deleted: true })).toEqual(before);
    });
  });

  describe("graph_to_rows", () => {
    it("flattens a rendered graph to its plain node and edge row arrays", () => {
      store.upsert_node(make_node({ id: "a", layer: "raw", attributes: { label: "A" } }));
      store.upsert_node(make_node({ id: "b", layer: "raw" }));
      store.upsert_edge(make_edge({ key: "e", src_id: "a", dst_id: "b", layer: "raw" }), []);
      const model = CustomGraphModel.hydrate(store);

      const { nodes, edges } = graph_to_rows(model.render([{ kind: "raw" }]));

      expect(nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
      expect(nodes.find((n) => n.id === "a")?.attributes.label).toBe("A");
      expect(edges.map((edge) => edge.key)).toEqual(["e"]);
      expect(edges[0].src_id).toBe("a");
    });

    it("flattens an empty graph to empty arrays", () => {
      const model = CustomGraphModel.hydrate(store);

      expect(graph_to_rows(model.render([]))).toEqual({ nodes: [], edges: [] });
    });
  });
});
