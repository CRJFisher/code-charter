import type { EdgeRow, GraphStore, NodeRow, ProvenanceRow } from "@code-charter/types";

/**
 * The degraded graph store used when the host lacks the built-in SQLite engine.
 *
 * A genuine null-object: every read returns empty, every write is a no-op, so downstream
 * runs without ever branching on availability. `file_changed_since_recorded` returns true
 * (a change detector must assume change when it knows nothing) and `schema_version` returns
 * 0 (no real schema).
 */
export class NullGraphStore implements GraphStore {
  all_nodes(): NodeRow[] {
    return [];
  }

  all_edges(): EdgeRow[] {
    return [];
  }

  snapshot(_opts?: { include_deleted?: boolean }): { nodes: NodeRow[]; edges: EdgeRow[] } {
    return { nodes: [], edges: [] };
  }

  provenance_for_edge(): ProvenanceRow[] {
    return [];
  }

  upsert_node(): void {}

  upsert_edge(): void {}

  write_fields(): { skipped: string[] } {
    return { skipped: [] };
  }

  node(): NodeRow | undefined {
    return undefined;
  }

  neighborhood(): { nodes: NodeRow[]; edges: EdgeRow[] } {
    return { nodes: [], edges: [] };
  }

  edges_for_files(): EdgeRow[] {
    return [];
  }

  record_file_hash(): void {}

  file_changed_since_recorded(): boolean {
    return true;
  }

  invalidate_edges_for_files(): void {}

  invalidate_nodes_for_files(): void {}

  soft_delete(): void {}

  table_disposition(): Array<{ table: string; disposable: boolean }> {
    return [];
  }

  rebuild_layer(_layer: "raw" | "agentic", write: (s: GraphStore) => void): void {
    write(this);
  }

  transaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  schema_version(): number {
    return 0;
  }

  close(): void {}
}
