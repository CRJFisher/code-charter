import { describe, expect, it } from "@jest/globals";

import type { EdgeRow, GraphStore, GraphTarget, NodeRow, ProvenanceRow, Tier } from "@code-charter/core";

import { dry_run_store } from "./dry_run_store";

const NODE: NodeRow = {
  id: "a.ts#a:function",
  kind: "code.function",
  path: "a.ts",
  anchor: "a:hash",
  layer: "raw",
  attributes: {},
  field_ownership: {},
  origin: "test",
  intent_source: "code-edit",
  deleted_at: null,
};

const EDGE: EdgeRow = {
  key: "edge-1",
  src_id: "a.ts#a:function",
  dst_id: "b.ts#b:function",
  kind: "code.calls",
  confidence: 1,
  layer: "raw",
  attributes: {},
  field_ownership: {},
  origin: "test",
  intent_source: "code-edit",
  adjudication: null,
  deleted_at: null,
};

const PROVENANCE: ProvenanceRow[] = [
  { edge_key: "edge-1", source_file: "a.ts", source_range: "1:0-2:0", extractor_id: "x", extractor_version: "1" },
];

/** Records every method invocation so a wrapped read can be proven to reach the underlying store. */
class RecordingStore implements GraphStore {
  readonly calls: Array<{ method: string; args: unknown[] }> = [];

  private record(method: string, args: unknown[]): void {
    this.calls.push({ method, args });
  }

  called(method: string): boolean {
    return this.calls.some((c) => c.method === method);
  }

  args_for(method: string): unknown[] {
    return this.calls.find((c) => c.method === method)?.args ?? [];
  }

  all_nodes(opts?: { include_deleted?: boolean }): NodeRow[] {
    this.record("all_nodes", [opts]);
    return [NODE];
  }
  all_edges(opts?: { include_deleted?: boolean }): EdgeRow[] {
    this.record("all_edges", [opts]);
    return [EDGE];
  }
  snapshot(): { nodes: NodeRow[]; edges: EdgeRow[] } {
    this.record("snapshot", []);
    return { nodes: [NODE], edges: [EDGE] };
  }
  provenance_for_edge(edge_key: string): ProvenanceRow[] {
    this.record("provenance_for_edge", [edge_key]);
    return PROVENANCE;
  }
  upsert_node(row: NodeRow): void {
    this.record("upsert_node", [row]);
  }
  upsert_edge(row: EdgeRow, provenance: ProvenanceRow[]): void {
    this.record("upsert_edge", [row, provenance]);
  }
  write_fields(target: GraphTarget, fields: Record<string, unknown>, as_tier: Tier): { skipped: string[] } {
    this.record("write_fields", [target, fields, as_tier]);
    return { skipped: ["from-underlying"] };
  }
  node(id: string): NodeRow | undefined {
    this.record("node", [id]);
    return NODE;
  }
  neighborhood(id: string, depth: number): { nodes: NodeRow[]; edges: EdgeRow[] } {
    this.record("neighborhood", [id, depth]);
    return { nodes: [NODE], edges: [EDGE] };
  }
  edges_for_files(paths: string[]): EdgeRow[] {
    this.record("edges_for_files", [paths]);
    return [EDGE];
  }
  record_file_hash(path: string): void {
    this.record("record_file_hash", [path]);
  }
  file_changed_since_recorded(path: string): boolean {
    this.record("file_changed_since_recorded", [path]);
    return true;
  }
  invalidate_edges_for_files(paths: string[]): void {
    this.record("invalidate_edges_for_files", [paths]);
  }
  invalidate_nodes_for_files(paths: string[]): void {
    this.record("invalidate_nodes_for_files", [paths]);
  }
  soft_delete(target: GraphTarget): void {
    this.record("soft_delete", [target]);
  }
  table_disposition(): Array<{ table: string; disposable: boolean }> {
    this.record("table_disposition", []);
    return [{ table: "nodes", disposable: false }];
  }
  transaction<T>(fn: () => Promise<T>): Promise<T> {
    this.record("transaction", [fn]);
    return fn();
  }
  rebuild_layer(layer: "raw" | "agentic", write: (s: GraphStore) => void): void {
    this.record("rebuild_layer", [layer, write]);
    write(this);
  }
  schema_version(): number {
    this.record("schema_version", []);
    return 7;
  }
  close(): void {
    this.record("close", []);
  }
}

describe("dry_run_store", () => {
  it("forwards all_nodes with its options and returns the underlying rows", () => {
    const inner = new RecordingStore();
    const wrapped = dry_run_store(inner);
    expect(wrapped.all_nodes({ include_deleted: true })).toEqual([NODE]);
    expect(inner.args_for("all_nodes")).toEqual([{ include_deleted: true }]);
  });

  it("forwards all_edges with its options and returns the underlying rows", () => {
    const inner = new RecordingStore();
    expect(dry_run_store(inner).all_edges({ include_deleted: false })).toEqual([EDGE]);
    expect(inner.args_for("all_edges")).toEqual([{ include_deleted: false }]);
  });

  it("forwards snapshot and returns the underlying pair", () => {
    const inner = new RecordingStore();
    expect(dry_run_store(inner).snapshot()).toEqual({ nodes: [NODE], edges: [EDGE] });
    expect(inner.called("snapshot")).toBe(true);
  });

  it("forwards provenance_for_edge with the edge key", () => {
    const inner = new RecordingStore();
    expect(dry_run_store(inner).provenance_for_edge("edge-1")).toEqual(PROVENANCE);
    expect(inner.args_for("provenance_for_edge")).toEqual(["edge-1"]);
  });

  it("forwards node lookup by id", () => {
    const inner = new RecordingStore();
    expect(dry_run_store(inner).node("a.ts#a:function")).toEqual(NODE);
    expect(inner.args_for("node")).toEqual(["a.ts#a:function"]);
  });

  it("forwards neighborhood with id and depth", () => {
    const inner = new RecordingStore();
    expect(dry_run_store(inner).neighborhood("a.ts#a:function", 2)).toEqual({ nodes: [NODE], edges: [EDGE] });
    expect(inner.args_for("neighborhood")).toEqual(["a.ts#a:function", 2]);
  });

  it("forwards edges_for_files with the path list", () => {
    const inner = new RecordingStore();
    expect(dry_run_store(inner).edges_for_files(["a.ts"])).toEqual([EDGE]);
    expect(inner.args_for("edges_for_files")).toEqual([["a.ts"]]);
  });

  it("forwards file_changed_since_recorded and returns its verdict", () => {
    const inner = new RecordingStore();
    expect(dry_run_store(inner).file_changed_since_recorded("a.ts")).toBe(true);
    expect(inner.args_for("file_changed_since_recorded")).toEqual(["a.ts"]);
  });

  it("forwards table_disposition", () => {
    const inner = new RecordingStore();
    expect(dry_run_store(inner).table_disposition()).toEqual([{ table: "nodes", disposable: false }]);
    expect(inner.called("table_disposition")).toBe(true);
  });

  it("forwards schema_version", () => {
    const inner = new RecordingStore();
    expect(dry_run_store(inner).schema_version()).toBe(7);
    expect(inner.called("schema_version")).toBe(true);
  });

  it("swallows every mutating call without reaching the underlying store", () => {
    const inner = new RecordingStore();
    const wrapped = dry_run_store(inner);

    wrapped.upsert_node(NODE);
    wrapped.upsert_edge(EDGE, PROVENANCE);
    wrapped.record_file_hash("a.ts");
    wrapped.invalidate_edges_for_files(["a.ts"]);
    wrapped.invalidate_nodes_for_files(["a.ts"]);
    wrapped.soft_delete({ kind: "node", id: "a.ts#a:function" });
    wrapped.close();

    expect(inner.calls).toEqual([]);
  });

  it("returns an empty skip list from write_fields and never reaches the underlying ladder", () => {
    const inner = new RecordingStore();
    const result = dry_run_store(inner).write_fields(
      { kind: "node", id: "a.ts#a:function" },
      { description: "x" },
      "agentic",
    );
    expect(result).toEqual({ skipped: [] });
    expect(inner.called("write_fields")).toBe(false);
  });

  it("no-ops rebuild_layer so its write callback never runs", () => {
    const inner = new RecordingStore();
    let ran = false;
    dry_run_store(inner).rebuild_layer("raw", () => {
      ran = true;
    });
    expect(ran).toBe(false);
    expect(inner.called("rebuild_layer")).toBe(false);
  });
});
