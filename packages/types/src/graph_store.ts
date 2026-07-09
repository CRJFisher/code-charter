/**
 * task-27.0 — the shared custom-graph contract.
 *
 * A custom graph is layered over the Ariadne call graph in three tiers, split by
 * cost-of-regeneration. Each row carries its `layer`, and `field_ownership` records
 * which tier owns each field so a cheap rebuild never clobbers an expensive one:
 *
 *   - 'raw'     (L0) parse / symbols / call+import edges / literal doc edges.
 *                    Free, deterministic — nuked & rebuilt on re-parse.
 *   - 'agentic' (L1) behaviour descriptions, groups, inferred edges.
 *                    Expensive, non-deterministic (LLM) — preserved on re-parse.
 *   - 'user'    (L2) labels, pins, positions, manual descriptions, adjudications.
 *                    Irreplaceable — preserved on re-parse.
 *
 * Precedence ladder `user (2) > agentic (1) > raw (0)`: a write at tier T may
 * overwrite a field only if its current owner ranks <= T (see `write_fields`).
 *
 * This module is the contract only — pure TypeScript with ZERO imports (no
 * `@ariadnejs/types`, no `node:sqlite`) so the webview can import the row shapes.
 * The SQLite store, graphology model, resolver, and render() impls live in
 * `@code-charter/core` and depend on this file, never the reverse.
 */

/** The three tiers, low-to-high cost of regeneration. */
export type Layer = "raw" | "agentic" | "user";

/** Owner tier for a single field; identical set to {@link Layer}. */
export type Tier = Layer;

/** Precedence ranks. A write at tier T overwrites a field only if rank(owner) <= rank(T). */
export const TIER_RANK: Record<Tier, number> = { raw: 0, agentic: 1, user: 2 };

/** Which producer wrote a row. Open string (no closed enum) — reserved values are not enforced. */
export type Origin = string;

/**
 * Whose intent a row reflects (the authority axis, distinct from {@link Layer}).
 * Reserved values are documented but not enforced.
 */
export type IntentSource = "code-edit" | "diagram-edit" | "explicit-pin" | (string & {});

/** A graph node row. Holds raw code symbols and agentic/user higher-level nodes alike. */
export interface NodeRow {
  /** Stable id `<file_path>#<anchor>` (task-21.1) — never a domain-specific name. */
  id: string;
  /** Namespaced open kind, e.g. 'code.function', 'agentic.group', 'user.label'. */
  kind: string;
  path: string;
  /** `symbol_path:content_hash` this node tracks, or null for non-anchored nodes. */
  anchor: string | null;
  layer: Layer;
  /** Overflow attribute bag (description, label, group members, ...). */
  attributes: Record<string, unknown>;
  /** field name -> owning tier; an absent field is owned by 'raw'. */
  field_ownership: Record<string, Tier>;
  origin: Origin;
  intent_source: IntentSource;
  /** ISO-8601 soft-delete timestamp; null = live. Agentic/user content is never hard-deleted. */
  deleted_at: string | null;
}

/** A directed graph edge row. */
export interface EdgeRow {
  /** Deterministic, stable across rebuilds (e.g. hash(src, dst, kind, call_site_range)). */
  key: string;
  src_id: string;
  dst_id: string;
  /** Namespaced open kind, e.g. 'code.calls', 'agentic.inferred', 'user.contains'. */
  kind: string;
  /** Provenance confidence; raw = high, agentic.inferred = lower (drives dashed render). */
  confidence: number;
  layer: Layer;
  attributes: Record<string, unknown>;
  field_ownership: Record<string, Tier>;
  origin: Origin;
  intent_source: IntentSource;
  /** A user-layer call on an agentic edge: null | 'accepted' | 'rejected' | 'proposed' (open). */
  adjudication: string | null;
  deleted_at: string | null;
}

/** Non-optional provenance for a (raw) edge — the precision behind invalidation. */
export interface ProvenanceRow {
  edge_key: string;
  source_file: string;
  source_range: string;
  extractor_id: string;
  extractor_version: string;
}

/**
 * A stable reference from custom content to a code element — `(symbol_path, content_hash)`,
 * NEVER a line number or bare name, so it follows a renamed/moved element.
 */
export interface Anchor {
  symbol_path: string;
  content_hash: string;
}

/**
 * The current code state an anchor resolves to. Carried by the 'hit' and 'downgrade'
 * arms of {@link ResolveResult}; the 'miss' arm carries no state.
 */
export interface CodeState {
  symbol_path: string;
  content_hash: string;
  span_hash: string;
}

/**
 * Output of the single reusable anchor resolver (impl in @code-charter/core). Both the drift-repair
 * and proposal-validation passes call it.
 *   - 'hit'       symbol_path AND content_hash match — content is correctly attached.
 *   - 'downgrade' relocated/body-changed but still resolvable — re-anchor to `state`.
 *                 'relocated' = content_hash matches at a different symbol_path (renamed
 *                 in place or moved across files); 'body-changed' = symbol_path matches,
 *                 content_hash differs.
 *   - 'miss'      not resolvable — the node is soft-deleted; agentic content is regenerated on a later sync.
 */
export type ResolveResult =
  | { status: "hit"; state: CodeState }
  | { status: "downgrade"; state: CodeState; reason: "relocated" | "body-changed" }
  | { status: "miss" };

/**
 * One entry in the open, ordered list that render() composes (AC1/AC6). The 'overlay' arm composes
 * proposed rows as one more entry rather than a signature change. render()'s return type is a
 * graphology graph, so its signature lives in @code-charter/core — only this pure-data input lives here.
 */
export type LayerSpec =
  | { kind: "raw" }
  | { kind: "agentic" }
  | { kind: "user" }
  | { kind: "overlay"; rows: { nodes: NodeRow[]; edges: EdgeRow[] } };

/** A node or edge addressed by its stable id/key. */
export type GraphTarget = { kind: "node" | "edge"; id: string };

/**
 * The persistent graph store. Nothing downstream imports the SQLite engine directly — they
 * depend on this interface, so the engine (node:sqlite) is a one-file swap.
 */
export interface GraphStore {
  all_nodes(opts?: { include_deleted?: boolean }): NodeRow[];
  all_edges(opts?: { include_deleted?: boolean }): EdgeRow[];

  /**
   * All nodes and edges read in ONE transaction, so a writer committing between the two reads can
   * never produce a torn nodes/edges pair. Concurrent readers (the extension webview) read through
   * this, never through back-to-back all_nodes/all_edges calls. `include_deleted` returns
   * soft-deleted (retired) rows too — the inspect path needs retired flow nodes to count them.
   */
  snapshot(opts?: { include_deleted?: boolean }): { nodes: NodeRow[]; edges: EdgeRow[] };

  provenance_for_edge(edge_key: string): ProvenanceRow[];

  upsert_node(row: NodeRow): void;
  upsert_edge(row: EdgeRow, provenance: ProvenanceRow[]): void;

  /**
   * Ladder-aware write (AC2): writes each field only if its current owner ranks <= `as_tier`,
   * then stamps the written fields as owned by `as_tier`. Returns the fields it skipped because
   * a higher tier owns them.
   *
   * A user-tier write that lands also promotes the row's structural `layer` to `'user'`, so the row
   * vacates the rebuild-eligible layer: a later `rebuild_layer('raw'|'agentic')` (which nukes by
   * `layer`) can never destroy user-owned content. Promotion is one-directional (it never demotes) and
   * is performed by each `write_fields` implementation, not by the shared field-bag ladder. Because
   * promotion is one-directional, the agentic pass refreshes an agentic-owned field on a promoted row
   * by re-targeting it through `write_fields`, not by re-emitting the row.
   */
  write_fields(
    target: GraphTarget,
    fields: Record<string, unknown>,
    as_tier: Tier,
  ): { skipped: string[] };

  node(id: string): NodeRow | undefined;
  neighborhood(id: string, depth: number): { nodes: NodeRow[]; edges: EdgeRow[] };

  /**
   * All edges whose provenance points into any of `paths`. The scoped read behind
   * task-27.1's diff signal: it diffs `edges_for_files(changed)` against a fresh
   * extraction of those files. (The diff itself is derived and never persisted.)
   */
  edges_for_files(paths: string[]): EdgeRow[];

  record_file_hash(path: string): void;
  file_changed_since_recorded(path: string): boolean;
  invalidate_edges_for_files(paths: string[]): void;
  /**
   * Mark-stale/remove the raw NODES sourced from `paths` — the node-lifecycle
   * counterpart to `invalidate_edges_for_files` (a removed/renamed symbol's raw
   * node). Only raw-tier nodes are touched; agentic/user nodes are preserved and
   * follow the change through the resolver instead.
   */
  invalidate_nodes_for_files(paths: string[]): void;

  /** Soft-delete only — there is no hard delete on agentic/user content (AC5); revival is a later upsert. */
  soft_delete(target: GraphTarget): void;

  /** The per-table disposable/preserved property as DATA, never a hard-coded name list (AC6). */
  table_disposition(): Array<{ table: string; disposable: boolean }>;

  /**
   * Nuke the LIVE rows of `layer` plus every cache `table_disposition()` marks disposable, then
   * run `write` in a transaction; the ladder protects higher tiers. A soft-deleted agentic/user
   * row is left untouched (restorable). Re-parse => rebuild_layer('raw'); an explicit agentic
   * pass => rebuild_layer('agentic'). The user layer is never rebuilt.
   */
  rebuild_layer(layer: "raw" | "agentic", write: (s: GraphStore) => void): void;

  /**
   * Run `fn` inside ONE store transaction: every mutation `fn` makes commits together, or — if `fn`
   * throws or the process dies mid-flight — rolls back together, so a caller that issues many
   * independent writes (a reconcile turn) can never leave a half-applied state on disk. Re-entrant:
   * a nested call runs inline within the open transaction rather than opening a second one. The
   * transaction is held across `fn`'s `await` points; safe because a single connection serves one
   * writer and whole reconcile runs are serialized by the process-level reconcile mutex.
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;

  schema_version(): number;
  close(): void;
}
