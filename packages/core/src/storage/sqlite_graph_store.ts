import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLOutputValue, type StatementSync } from "node:sqlite";

import {
  type EdgeRow,
  type GraphStore,
  type GraphTarget,
  type Layer,
  type NodeRow,
  type ProvenanceRow,
  type Tier,
} from "@code-charter/types";

import { apply_field_ladder } from "./field_ladder";
import {
  CREATE_META_TABLES_SQL,
  CREATE_SCHEMA_SQL,
  CURRENT_SCHEMA_VERSION,
  TABLE_REGISTRY_SEED,
} from "./schema";

/** A row as returned by node:sqlite — every column is a SQL scalar keyed by name. */
type DbRow = Record<string, SQLOutputValue>;

/**
 * The persistent graph store backed by Node's built-in SQLite engine. This is the only
 * file in the codebase that touches the engine; everything else depends on {@link GraphStore}.
 *
 * Use {@link open_graph_store} rather than constructing this directly — the factory gates on
 * host support and returns a degraded store on unsupported hosts.
 */
export class SqliteGraphStore implements GraphStore {
  private readonly db: DatabaseSync;
  private readonly statement_cache = new Map<string, StatementSync>();
  private in_transaction = false;

  constructor(db_path: string) {
    this.db = new DatabaseSync(db_path);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.initialize_schema();
  }

  // --- schema lifecycle -----------------------------------------------------

  private initialize_schema(): void {
    this.with_transaction(() => {
      this.db.exec(CREATE_META_TABLES_SQL);
      const stored = this.read_stored_version();
      if (stored === undefined) {
        this.db.exec(CREATE_SCHEMA_SQL);
        this.seed_registry();
        this.db.prepare("INSERT INTO schema_version (id, version) VALUES (1, ?)").run(CURRENT_SCHEMA_VERSION);
      } else if (stored === CURRENT_SCHEMA_VERSION) {
        this.db.exec(CREATE_SCHEMA_SQL);
        this.seed_registry();
      } else {
        this.rebuild_disposable_tables();
        this.db.prepare("UPDATE schema_version SET version = ? WHERE id = 1").run(CURRENT_SCHEMA_VERSION);
      }
    });
  }

  private read_stored_version(): number | undefined {
    const row = this.db.prepare("SELECT version FROM schema_version WHERE id = 1").get();
    return row ? as_num(row.version) : undefined;
  }

  private seed_registry(): void {
    // The code-side seed is authoritative for the tables it owns (a later version can flip a
    // disposition); externally-registered tables are not in the seed and survive untouched.
    const insert = this.db.prepare(
      `INSERT INTO table_registry (table_name, disposable) VALUES (?, ?)
       ON CONFLICT(table_name) DO UPDATE SET disposable = excluded.disposable`,
    );
    for (const entry of TABLE_REGISTRY_SEED) {
      insert.run(entry.table_name, entry.disposable ? 1 : 0);
    }
  }

  private rebuild_disposable_tables(): void {
    const disposables = this.table_disposition()
      .filter((t) => t.disposable)
      .map((t) => t.table);
    for (const name of disposables) {
      this.db.exec(`DROP TABLE IF EXISTS "${name}"`);
    }
    this.db.exec(CREATE_SCHEMA_SQL);
    this.seed_registry();
  }

  // --- statement cache + transactions --------------------------------------

  private sql(query: string): StatementSync {
    let statement = this.statement_cache.get(query);
    if (!statement) {
      statement = this.db.prepare(query);
      this.statement_cache.set(query, statement);
    }
    return statement;
  }

  /**
   * Re-entrant transaction wrapper. Only the outermost call issues BEGIN/COMMIT, since SQLite
   * forbids a nested BEGIN — an inner call runs `fn` inline within the open transaction. On
   * error the outermost call rolls back and rethrows; a failing ROLLBACK never masks the
   * original error.
   */
  private with_transaction<T>(fn: () => T): T {
    if (this.in_transaction) {
      return fn();
    }
    this.db.exec("BEGIN");
    this.in_transaction = true;
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // A failing ROLLBACK must not mask the original error.
      }
      throw err;
    } finally {
      this.in_transaction = false;
    }
  }

  // --- reads ----------------------------------------------------------------

  all_nodes(opts?: { include_deleted?: boolean }): NodeRow[] {
    const query = opts?.include_deleted
      ? "SELECT * FROM nodes"
      : "SELECT * FROM nodes WHERE deleted_at IS NULL";
    return this.sql(query).all().map(row_to_node);
  }

  all_edges(opts?: { include_deleted?: boolean }): EdgeRow[] {
    const query = opts?.include_deleted
      ? "SELECT * FROM edges"
      : "SELECT * FROM edges WHERE deleted_at IS NULL";
    return this.sql(query).all().map(row_to_edge);
  }

  provenance_for_edge(edge_key: string): ProvenanceRow[] {
    return this.sql(
      "SELECT edge_key, source_file, source_range, extractor_id, extractor_version FROM edge_provenance WHERE edge_key = ?",
    )
      .all(edge_key)
      .map(row_to_provenance);
  }

  node(id: string): NodeRow | undefined {
    const row = this.sql("SELECT * FROM nodes WHERE id = ? AND deleted_at IS NULL").get(id);
    return row ? row_to_node(row) : undefined;
  }

  neighborhood(id: string, depth: number): { nodes: NodeRow[]; edges: EdgeRow[] } {
    const visited = new Set<string>([id]);
    const collected = new Map<string, EdgeRow>();
    let frontier = [id];
    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const placeholders = frontier.map(() => "?").join(",");
      const rows = this.sql(
        `SELECT * FROM edges WHERE (src_id IN (${placeholders}) OR dst_id IN (${placeholders})) AND deleted_at IS NULL`,
      ).all(...frontier, ...frontier);
      const next: string[] = [];
      for (const r of rows) {
        const edge = row_to_edge(r);
        collected.set(edge.key, edge);
        for (const nid of [edge.src_id, edge.dst_id]) {
          if (!visited.has(nid)) {
            visited.add(nid);
            next.push(nid);
          }
        }
      }
      frontier = next;
    }
    const ids = [...visited];
    let nodes: NodeRow[] = [];
    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(",");
      nodes = this.sql(`SELECT * FROM nodes WHERE id IN (${placeholders}) AND deleted_at IS NULL`)
        .all(...ids)
        .map(row_to_node);
    }
    return { nodes, edges: [...collected.values()] };
  }

  edges_for_files(paths: string[]): EdgeRow[] {
    if (paths.length === 0) return [];
    const placeholders = paths.map(() => "?").join(",");
    return this.sql(
      `SELECT DISTINCT e.* FROM edges e JOIN edge_provenance p ON p.edge_key = e.key WHERE p.source_file IN (${placeholders}) AND e.deleted_at IS NULL`,
    )
      .all(...paths)
      .map(row_to_edge);
  }

  // --- writes ---------------------------------------------------------------

  upsert_node(row: NodeRow): void {
    this.sql(
      `INSERT INTO nodes (id, kind, path, anchor, layer, attributes, field_ownership, origin, intent_source, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         kind = excluded.kind, path = excluded.path, anchor = excluded.anchor, layer = excluded.layer,
         attributes = excluded.attributes, field_ownership = excluded.field_ownership,
         origin = excluded.origin, intent_source = excluded.intent_source, deleted_at = excluded.deleted_at`,
    ).run(
      row.id,
      row.kind,
      row.path,
      row.anchor ?? null,
      row.layer,
      JSON.stringify(row.attributes ?? {}),
      JSON.stringify(row.field_ownership ?? {}),
      row.origin,
      row.intent_source,
      row.deleted_at ?? null,
    );
  }

  upsert_edge(row: EdgeRow, provenance: ProvenanceRow[]): void {
    this.with_transaction(() => {
      this.sql(
        `INSERT INTO edges (key, src_id, dst_id, kind, confidence, layer, attributes, field_ownership, origin, intent_source, adjudication, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           src_id = excluded.src_id, dst_id = excluded.dst_id, kind = excluded.kind,
           confidence = excluded.confidence, layer = excluded.layer, attributes = excluded.attributes,
           field_ownership = excluded.field_ownership, origin = excluded.origin,
           intent_source = excluded.intent_source, adjudication = excluded.adjudication,
           deleted_at = excluded.deleted_at`,
      ).run(
        row.key,
        row.src_id,
        row.dst_id,
        row.kind,
        row.confidence,
        row.layer,
        JSON.stringify(row.attributes ?? {}),
        JSON.stringify(row.field_ownership ?? {}),
        row.origin,
        row.intent_source,
        row.adjudication ?? null,
        row.deleted_at ?? null,
      );
      this.sql("DELETE FROM edge_provenance WHERE edge_key = ?").run(row.key);
      const insert = this.sql(
        "INSERT INTO edge_provenance (edge_key, source_file, source_range, extractor_id, extractor_version) VALUES (?, ?, ?, ?, ?)",
      );
      for (const p of provenance) {
        insert.run(p.edge_key, p.source_file, p.source_range, p.extractor_id, p.extractor_version);
      }
    });
  }

  /**
   * Ladder-aware write into the overflow attribute bag (`attributes` + `field_ownership`). Each field
   * is written only if its current owner's tier ranks at or below `as_tier`; written fields are stamped
   * as `as_tier`, and fields a higher tier owns are returned in `skipped`.
   *
   * A user-tier write that lands also promotes the row's structural `layer` to `'user'`, so the row
   * vacates the rebuild-eligible layer and a later `rebuild_layer('raw'|'agentic')` (which nukes by
   * `layer`) can never destroy user-owned content. Promotion is one-directional (it never demotes) and
   * lives in this wrapper, not in the shared `apply_field_ladder` (which stays field-bag-only so the
   * store and model compute identical accept/skip decisions). The agentic pass refreshes an
   * agentic-owned field on a promoted row by targeting it through `write_fields`, never by re-emit.
   */
  write_fields(target: GraphTarget, fields: Record<string, unknown>, as_tier: Tier): { skipped: string[] } {
    const table = target.kind === "node" ? "nodes" : "edges";
    const id_col = target.kind === "node" ? "id" : "key";
    return this.with_transaction(() => {
      const row = this.sql(`SELECT attributes, field_ownership, layer FROM ${table} WHERE ${id_col} = ?`).get(target.id);
      if (!row) return { skipped: [] };
      const attributes = parse_json_object(as_text(row.attributes));
      const ownership = parse_ownership(as_text(row.field_ownership));
      const { skipped, written } = apply_field_ladder(attributes, ownership, fields, as_tier);
      const promote = as_tier === "user" && written.length > 0 && as_text(row.layer) !== "user";
      if (promote) {
        this.sql(`UPDATE ${table} SET attributes = ?, field_ownership = ?, layer = 'user' WHERE ${id_col} = ?`).run(
          JSON.stringify(attributes),
          JSON.stringify(ownership),
          target.id,
        );
      } else {
        this.sql(`UPDATE ${table} SET attributes = ?, field_ownership = ? WHERE ${id_col} = ?`).run(
          JSON.stringify(attributes),
          JSON.stringify(ownership),
          target.id,
        );
      }
      return { skipped };
    });
  }

  // --- file incidence (the diff/drift seam) --------------------------------

  record_file_hash(path: string): void {
    const { sha256, size } = hash_file(path);
    this.sql(
      `INSERT INTO file_hashes (path, sha256, size, last_seen_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET sha256 = excluded.sha256, size = excluded.size, last_seen_at = excluded.last_seen_at`,
    ).run(path, sha256, size, new Date().toISOString());
  }

  file_changed_since_recorded(path: string): boolean {
    const row = this.sql("SELECT sha256 FROM file_hashes WHERE path = ?").get(path);
    if (!row) return true;
    const current = read_file_hash(path);
    // A deleted file is the clearest "changed" signal — report changed rather than throwing.
    if (current === undefined) return true;
    return as_text(row.sha256) !== current.sha256;
  }

  invalidate_edges_for_files(paths: string[]): void {
    if (paths.length === 0) return;
    this.with_transaction(() => {
      const placeholders = paths.map(() => "?").join(",");
      const keys = this.sql(
        `SELECT DISTINCT e.key AS key FROM edges e JOIN edge_provenance p ON p.edge_key = e.key WHERE e.layer = 'raw' AND p.source_file IN (${placeholders})`,
      )
        .all(...paths)
        .map((r) => as_text(r.key));
      if (keys.length === 0) return;
      const key_placeholders = keys.map(() => "?").join(",");
      // Delete provenance explicitly (belt-and-suspenders alongside the ON DELETE CASCADE FK).
      this.sql(`DELETE FROM edge_provenance WHERE edge_key IN (${key_placeholders})`).run(...keys);
      this.sql(`DELETE FROM edges WHERE key IN (${key_placeholders})`).run(...keys);
    });
  }

  invalidate_nodes_for_files(paths: string[]): void {
    if (paths.length === 0) return;
    this.with_transaction(() => {
      const placeholders = paths.map(() => "?").join(",");
      this.sql(`DELETE FROM nodes WHERE layer = 'raw' AND path IN (${placeholders})`).run(...paths);
    });
  }

  // --- soft delete ----------------------------------------------------------

  soft_delete(target: GraphTarget): void {
    const table = target.kind === "node" ? "nodes" : "edges";
    const id_col = target.kind === "node" ? "id" : "key";
    this.sql(`UPDATE ${table} SET deleted_at = ? WHERE ${id_col} = ? AND layer != 'raw'`).run(
      new Date().toISOString(),
      target.id,
    );
  }

  // --- disposition + rebuild ------------------------------------------------

  table_disposition(): Array<{ table: string; disposable: boolean }> {
    return this.sql("SELECT table_name, disposable FROM table_registry ORDER BY table_name")
      .all()
      .map((r) => ({ table: as_text(r.table_name), disposable: as_num(r.disposable) === 1 }));
  }

  rebuild_layer(layer: "raw" | "agentic", write: (s: GraphStore) => void): void {
    this.with_transaction(() => {
      // Nuke only this tier's LIVE rows. A soft-deleted (deleted_at set) agentic/user row is
      // left untouched — neither hard-deleted nor un-flagged — so it stays restorable (AC#5).
      // Higher-tier rows survive because they carry a different `layer`; and any higher-tier-owned
      // field on a surviving row is protected by the write_fields ladder the writer goes through,
      // not by an ownership re-check here.
      this.sql("DELETE FROM nodes WHERE layer = ? AND deleted_at IS NULL").run(layer);
      this.sql("DELETE FROM edges WHERE layer = ? AND deleted_at IS NULL").run(layer);
      // Clear (DELETE the rows of) every cache the registry marks disposable (e.g. anchor_resolution)
      // — DELETE, not DROP: the cache table survives, only its stale derived rows go. Read as DATA,
      // never a hard-coded name list, so a newly-registered disposable cache is cleared with no code
      // change here. Preserved tables (nodes/edges/...) are tagged non-disposable and skipped. The
      // loop assumes every disposable-registered table exists (CREATE_SCHEMA_SQL creates them).
      for (const { table } of this.table_disposition().filter((t) => t.disposable)) {
        this.db.exec(`DELETE FROM "${table}"`);
      }
      write(this);
    });
  }

  schema_version(): number {
    const row = this.sql("SELECT version FROM schema_version WHERE id = 1").get();
    return row ? as_num(row.version) : 0;
  }

  close(): void {
    this.statement_cache.clear();
    this.db.close();
  }
}

// --- module helpers ---------------------------------------------------------

function as_text(value: SQLOutputValue): string {
  if (typeof value !== "string") {
    throw new Error(`expected a text column, got ${typeof value}`);
  }
  return value;
}

function as_text_or_null(value: SQLOutputValue): string | null {
  return value === null ? null : as_text(value);
}

function as_num(value: SQLOutputValue): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  throw new Error(`expected a numeric column, got ${typeof value}`);
}

function as_layer(value: SQLOutputValue): Layer {
  const text = as_text(value);
  if (text === "raw" || text === "agentic" || text === "user") return text;
  throw new Error(`expected a layer column, got ${text}`);
}

function row_to_node(r: DbRow): NodeRow {
  return {
    id: as_text(r.id),
    kind: as_text(r.kind),
    path: as_text(r.path),
    anchor: as_text_or_null(r.anchor),
    layer: as_layer(r.layer),
    attributes: parse_json_object(as_text(r.attributes)),
    field_ownership: parse_ownership(as_text(r.field_ownership)),
    origin: as_text(r.origin),
    intent_source: as_text(r.intent_source),
    deleted_at: as_text_or_null(r.deleted_at),
  };
}

function row_to_edge(r: DbRow): EdgeRow {
  return {
    key: as_text(r.key),
    src_id: as_text(r.src_id),
    dst_id: as_text(r.dst_id),
    kind: as_text(r.kind),
    confidence: as_num(r.confidence),
    layer: as_layer(r.layer),
    attributes: parse_json_object(as_text(r.attributes)),
    field_ownership: parse_ownership(as_text(r.field_ownership)),
    origin: as_text(r.origin),
    intent_source: as_text(r.intent_source),
    adjudication: as_text_or_null(r.adjudication),
    deleted_at: as_text_or_null(r.deleted_at),
  };
}

function row_to_provenance(r: DbRow): ProvenanceRow {
  return {
    edge_key: as_text(r.edge_key),
    source_file: as_text(r.source_file),
    source_range: as_text(r.source_range),
    extractor_id: as_text(r.extractor_id),
    extractor_version: as_text(r.extractor_version),
  };
}

function parse_json_object(value: string): Record<string, unknown> {
  if (!value) return {};
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("expected a JSON object column");
  }
  return parsed as Record<string, unknown>;
}

function parse_ownership(value: string): Record<string, Tier> {
  return parse_json_object(value) as Record<string, Tier>;
}

function hash_file(path: string): { sha256: string; size: number } {
  const buffer = readFileSync(path);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  return { sha256, size: buffer.byteLength };
}

function read_file_hash(path: string): { sha256: string; size: number } | undefined {
  try {
    return hash_file(path);
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT") {
      return undefined;
    }
    throw err;
  }
}
