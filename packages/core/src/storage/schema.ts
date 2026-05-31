/**
 * The on-disk schema for the SQLite graph store: DDL, the version sentinel, and the
 * table registry that drives the disposable/preserved rebuild policy as data.
 *
 * Three tiers (raw / agentic / user) live as the `layer` column inside `nodes`/`edges`,
 * not as separate tables, so those tables hold irreplaceable agentic/user rows and are
 * PRESERVED. Only a pure derived cache (`anchor_resolution`) is disposable.
 */

/**
 * Bumped on a disposable-table layout change; a mismatch drops and recreates the disposable
 * tables. Preserved tables (nodes/edges/...) are not auto-migrated — a layout change to them is
 * recovered from the agentic/user tiers and git-tracked sidecars (task-27.0), never by ALTER.
 */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Per-table disposition seeded into `table_registry`. `disposable` tables are dropped and
 * recreated on a schema-version mismatch; preserved tables and their rows survive untouched.
 * A new preserved table (e.g. a future `pending_edit`) declares itself with one registry
 * insert and needs no rebuild-code change.
 */
export const TABLE_REGISTRY_SEED: ReadonlyArray<{ table_name: string; disposable: boolean }> = [
  { table_name: "nodes", disposable: false },
  { table_name: "edges", disposable: false },
  { table_name: "edge_provenance", disposable: false },
  { table_name: "file_hashes", disposable: false },
  { table_name: "anchor_resolution", disposable: true },
  { table_name: "schema_version", disposable: false },
  { table_name: "table_registry", disposable: false },
];

/** The version sentinel + registry. Created first; both are preserved and drive everything else. */
export const CREATE_META_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS schema_version (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS table_registry (
  table_name TEXT PRIMARY KEY NOT NULL,
  disposable INTEGER NOT NULL
);
`;

/**
 * The full content schema (everything except the meta tables). Idempotent (`IF NOT EXISTS`),
 * so running it after dropping the disposable tables recreates exactly those tables.
 */
export const CREATE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  anchor TEXT,
  layer TEXT NOT NULL,
  attributes TEXT NOT NULL DEFAULT '{}',
  field_ownership TEXT NOT NULL DEFAULT '{}',
  origin TEXT NOT NULL,
  intent_source TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_nodes_path ON nodes(path);
CREATE INDEX IF NOT EXISTS idx_nodes_layer ON nodes(layer);

CREATE TABLE IF NOT EXISTS edges (
  key TEXT PRIMARY KEY NOT NULL,
  src_id TEXT NOT NULL,
  dst_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  confidence REAL NOT NULL,
  layer TEXT NOT NULL,
  attributes TEXT NOT NULL DEFAULT '{}',
  field_ownership TEXT NOT NULL DEFAULT '{}',
  origin TEXT NOT NULL,
  intent_source TEXT NOT NULL,
  adjudication TEXT,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(src_id);
CREATE INDEX IF NOT EXISTS idx_edges_dst ON edges(dst_id);
CREATE INDEX IF NOT EXISTS idx_edges_layer ON edges(layer);

CREATE TABLE IF NOT EXISTS edge_provenance (
  edge_key TEXT NOT NULL,
  source_file TEXT NOT NULL,
  source_range TEXT NOT NULL,
  extractor_id TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  PRIMARY KEY (edge_key, source_file, source_range, extractor_id),
  FOREIGN KEY (edge_key) REFERENCES edges(key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_edge_provenance_file ON edge_provenance(source_file);
CREATE INDEX IF NOT EXISTS idx_edge_provenance_key ON edge_provenance(edge_key);

CREATE TABLE IF NOT EXISTS file_hashes (
  path TEXT PRIMARY KEY NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS anchor_resolution (
  anchor TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  symbol_path TEXT,
  content_hash TEXT,
  span_hash TEXT,
  resolved_at TEXT NOT NULL
);
`;
