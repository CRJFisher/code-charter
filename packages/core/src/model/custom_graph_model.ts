import { MultiDirectedGraph } from "graphology";

import type {
  EdgeRow,
  GraphStore,
  GraphTarget,
  Layer,
  LayerSpec,
  NodeRow,
  ProvenanceRow,
  Tier,
} from "@code-charter/types";

import { apply_field_ladder } from "../storage/field_ladder";

/** Each graphology node/edge carries its full row under one attribute — lossless, cast-free. */
type NodeAttributes = { row: NodeRow };
type EdgeAttributes = { row: EdgeRow };

/** The working in-memory graph and the fresh graph `render()` returns share this shape. */
export type CustomGraph = MultiDirectedGraph<NodeAttributes, EdgeAttributes>;

/** A pending field-level edit: the value that landed and the tier it landed at. */
type DirtyField = { value: unknown; as_tier: Tier };

/** Full-row upsert pending flush, discriminated so the flush routes without casts. */
type DirtyUpsert =
  | { kind: "node"; id: string; row: NodeRow }
  | { kind: "edge"; key: string; row: EdgeRow; provenance: ProvenanceRow[] };

/**
 * The live, in-memory surface over the persistent {@link GraphStore}.
 *
 * Hydrates one graphology `MultiDirectedGraph` from `all_nodes`/`all_edges` (`include_deleted: true`),
 * keyed by stable node ids and deterministic edge keys. Edits mutate the in-memory graph and mark only
 * the touched rows dirty; {@link flush} writes **only those rows** back through the right store door —
 * field edits through `write_fields` (ladder-respecting), full raw rows through `upsert_node`/
 * `upsert_edge`, removals through `soft_delete`. The whole graph is never re-serialized.
 *
 * Lifecycle: {@link hydrate} to build → mutate via `upsert_node`/`upsert_edge`/`write_fields`/
 * `soft_delete` → {@link flush} to persist. {@link render} builds a separate read-only view at any
 * time. There is no `restore`: a soft-deleted row is revived not by un-flagging it but by a later
 * render layer overriding its `deleted_at` (see {@link render}).
 *
 * Two precedence mechanisms meet here and must not be conflated. The **write-side ladder**
 * (`user > agentic > raw`, via the shared {@link apply_field_ladder}) governs what {@link write_fields}
 * persists and who owns each field. The **read-side fold** in {@link render} composes the tiers into a
 * view by list order alone and never consults or stamps ownership.
 *
 * This is the single writer for the rows it holds; it assumes no other process mutates those store rows
 * between hydrate and flush.
 */
export class CustomGraphModel {
  private readonly graph: CustomGraph;

  private readonly dirty_fields = new Map<string, { target: GraphTarget; fields: Map<string, DirtyField> }>();
  private readonly dirty_upserts = new Map<string, DirtyUpsert>();
  private readonly dirty_deletes = new Map<string, GraphTarget>();

  private constructor(private readonly store: GraphStore) {
    this.graph = new MultiDirectedGraph<NodeAttributes, EdgeAttributes>();
  }

  /**
   * Build a model by hydrating the whole store into memory. Soft-deleted rows are included
   * (`include_deleted: true`) and held in memory — they are filtered at render, never dropped here.
   * Nodes load before edges so every edge endpoint already exists; a missing endpoint is a store
   * invariant violation and `addEdgeWithKey` is left to throw rather than silently swallow it.
   */
  static hydrate(store: GraphStore): CustomGraphModel {
    const model = new CustomGraphModel(store);
    for (const row of store.all_nodes({ include_deleted: true })) {
      model.graph.addNode(row.id, { row });
    }
    for (const row of store.all_edges({ include_deleted: true })) {
      model.graph.addEdgeWithKey(row.key, row.src_id, row.dst_id, { row });
    }
    return model;
  }

  // --- reads (in-memory, including held tombstones) -------------------------

  has_node(id: string): boolean {
    return this.graph.hasNode(id);
  }

  has_edge(key: string): boolean {
    return this.graph.hasEdge(key);
  }

  node_row(id: string): NodeRow | undefined {
    return this.graph.hasNode(id) ? this.graph.getNodeAttributes(id).row : undefined;
  }

  edge_row(key: string): EdgeRow | undefined {
    return this.graph.hasEdge(key) ? this.graph.getEdgeAttributes(key).row : undefined;
  }

  // --- mutations (mark dirty; nothing reaches the store until flush) --------

  /** Replace a full raw node row (structural columns and all). Flushes via `upsert_node`. */
  upsert_node(row: NodeRow): void {
    const stored = deep_clone(row);
    if (this.graph.hasNode(row.id)) {
      this.graph.replaceNodeAttributes(row.id, { row: stored });
    } else {
      this.graph.addNode(row.id, { row: stored });
    }
    this.supersede_dirty({ kind: "node", id: row.id }, { kind: "node", id: row.id, row: stored });
  }

  /**
   * Replace a full raw edge row plus its provenance. Flushes via `upsert_edge`. Endpoints must already
   * exist in the model — a new edge whose `src_id`/`dst_id` is absent makes `addEdgeWithKey` throw, so
   * upsert the endpoint nodes first. Provenance is replaced wholesale, mirroring the store's
   * `upsert_edge`: the passed array becomes the edge's complete provenance, so `[]` clears it.
   */
  upsert_edge(row: EdgeRow, provenance: ProvenanceRow[]): void {
    const stored = deep_clone(row);
    const stored_provenance = provenance.map(deep_clone);
    if (this.graph.hasEdge(row.key)) {
      this.graph.replaceEdgeAttributes(row.key, { row: stored });
    } else {
      this.graph.addEdgeWithKey(row.key, row.src_id, row.dst_id, { row: stored });
    }
    this.supersede_dirty(
      { kind: "edge", id: row.key },
      { kind: "edge", key: row.key, row: stored, provenance: stored_provenance },
    );
  }

  /**
   * Ladder-aware field edit into the overflow attribute bag. Applies the shared ladder in memory so the
   * returned `skipped` set matches what the store would compute, marks the written fields dirty, and
   * defers the persistent write to {@link flush}. An unknown target is a no-op returning
   * `{ skipped: [] }`, mirroring the store.
   *
   * A user-tier write that lands also promotes the in-memory row's structural `layer` to `'user'`,
   * mirroring {@link SqliteGraphStore.write_fields}: the promotion vacates the row from the
   * rebuild-eligible layer so a later `rebuild_layer` cannot destroy user-owned content. The deferred
   * {@link flush} replays the edit through the store's `write_fields`, which performs the same promotion
   * persistently — so the in-memory and stored `layer` stay identical with no extra dirty channel.
   * Promotion is one-directional (never demotes).
   */
  write_fields(target: GraphTarget, fields: Record<string, unknown>, as_tier: Tier): { skipped: string[] } {
    if (target.kind === "node") {
      if (!this.graph.hasNode(target.id)) return { skipped: [] };
      const row = this.graph.getNodeAttributes(target.id).row;
      const attributes = { ...row.attributes };
      const ownership = { ...row.field_ownership };
      const { skipped, written } = apply_field_ladder(attributes, ownership, deep_clone(fields), as_tier);
      if (written.length > 0) {
        const layer = promoted_layer(row.layer, as_tier);
        this.graph.replaceNodeAttributes(target.id, { row: { ...row, layer, attributes, field_ownership: ownership } });
        this.record_field_dirty(target, written, attributes, as_tier);
      }
      return { skipped };
    }
    if (!this.graph.hasEdge(target.id)) return { skipped: [] };
    const row = this.graph.getEdgeAttributes(target.id).row;
    const attributes = { ...row.attributes };
    const ownership = { ...row.field_ownership };
    const { skipped, written } = apply_field_ladder(attributes, ownership, deep_clone(fields), as_tier);
    if (written.length > 0) {
      const layer = promoted_layer(row.layer, as_tier);
      this.graph.replaceEdgeAttributes(target.id, { row: { ...row, layer, attributes, field_ownership: ownership } });
      this.record_field_dirty(target, written, attributes, as_tier);
    }
    return { skipped };
  }

  /**
   * Soft-delete by convention: never `dropNode`/`dropEdge`. The row stays in memory with `deleted_at`
   * set and is filtered at render. Mirrors the store: a no-op on raw-tier rows (raw is removed through
   * re-parse invalidation, never soft-deleted).
   */
  soft_delete(target: GraphTarget): void {
    if (target.kind === "node") {
      if (!this.graph.hasNode(target.id)) return;
      const row = this.graph.getNodeAttributes(target.id).row;
      if (row.layer === "raw") return;
      this.graph.replaceNodeAttributes(target.id, { row: { ...row, deleted_at: now_iso() } });
    } else {
      if (!this.graph.hasEdge(target.id)) return;
      const row = this.graph.getEdgeAttributes(target.id).row;
      if (row.layer === "raw") return;
      this.graph.replaceEdgeAttributes(target.id, { row: { ...row, deleted_at: now_iso() } });
    }
    this.dirty_deletes.set(target_key(target), target);
  }

  /**
   * Write every dirty row back through the store, then clear the dirty set. Routes by kind: full-row
   * upserts first (establish/replace the row), then ladder-respecting field edits (grouped into one
   * `write_fields` call per tier, since fields edited at different tiers in one cycle must each replay
   * at their own tier so the store stamps ownership identically to memory), then soft-deletes last.
   * Untouched rows are never written.
   *
   * Not atomic across rows — each store call is its own transaction — but safe to retry: every store
   * write is idempotent (upserts are INSERT-OR-REPLACE; a replayed field edit re-lands at the same
   * tier; a re-applied soft-delete re-sets the same flag), so a re-flush after a mid-flush throw
   * re-applies all still-dirty rows without corruption.
   */
  flush(): void {
    for (const upsert of this.dirty_upserts.values()) {
      if (upsert.kind === "node") {
        this.store.upsert_node(upsert.row);
      } else {
        this.store.upsert_edge(upsert.row, upsert.provenance);
      }
    }
    for (const { target, fields } of this.dirty_fields.values()) {
      const by_tier = new Map<Tier, Record<string, unknown>>();
      for (const [field, { value, as_tier }] of fields) {
        let bucket = by_tier.get(as_tier);
        if (!bucket) {
          bucket = {};
          by_tier.set(as_tier, bucket);
        }
        bucket[field] = value;
      }
      for (const [tier, bucket] of by_tier) {
        this.store.write_fields(target, bucket, tier);
      }
    }
    for (const target of this.dirty_deletes.values()) {
      this.store.soft_delete(target);
    }
    this.dirty_upserts.clear();
    this.dirty_fields.clear();
    this.dirty_deletes.clear();
  }

  // --- render (read-only fold; never written back) -------------------------

  /**
   * Fold an open, ordered `LayerSpec[]` (raw → agentic → user → overlay) into a fresh, non-persisted
   * graph. Precedence is **list order**: later layers win field-by-field — the attribute bag merges
   * per key, structural columns take the later layer's whole value. The fold never consults or stamps
   * `field_ownership` (it is dropped from the view), distinct from the write-side ladder. Overlays
   * supply their rows inline and are never written back, so the ladder never runs on them — a
   * `proposed` overlay is one more list entry with no signature change.
   *
   * Rows are folded including tombstones so a later layer can revive a soft-deleted row by overriding
   * `deleted_at`; only after folding are rows with `deleted_at` set dropped, unless `show_tombstones`.
   * An edge whose endpoint was dropped is dropped too (graphology forbids dangling edges).
   */
  render(layers: LayerSpec[], opts: { show_tombstones?: boolean } = {}): CustomGraph {
    const show_tombstones = opts.show_tombstones ?? false;
    const node_acc = new Map<string, NodeRow>();
    const edge_acc = new Map<string, EdgeRow>();
    for (const spec of layers) {
      const { nodes, edges } = this.rows_for_spec(spec);
      for (const node of nodes) {
        node_acc.set(node.id, merge_node_rows(node_acc.get(node.id), node));
      }
      for (const edge of edges) {
        edge_acc.set(edge.key, merge_edge_rows(edge_acc.get(edge.key), edge));
      }
    }

    const out: CustomGraph = new MultiDirectedGraph<NodeAttributes, EdgeAttributes>();
    const live_node_ids = new Set<string>();
    for (const [id, row] of node_acc) {
      if (!show_tombstones && row.deleted_at !== null) continue;
      out.addNode(id, { row: deep_clone(row) });
      live_node_ids.add(id);
    }
    for (const [key, row] of edge_acc) {
      if (!show_tombstones && row.deleted_at !== null) continue;
      if (!live_node_ids.has(row.src_id) || !live_node_ids.has(row.dst_id)) continue;
      out.addEdgeWithKey(key, row.src_id, row.dst_id, { row: deep_clone(row) });
    }
    return out;
  }

  // --- internals ------------------------------------------------------------

  /** The rows a single layer contributes: in-memory rows filtered by tier, or an overlay's own rows. */
  private rows_for_spec(spec: LayerSpec): { nodes: NodeRow[]; edges: EdgeRow[] } {
    if (spec.kind === "overlay") {
      return { nodes: spec.rows.nodes, edges: spec.rows.edges };
    }
    const layer = spec.kind;
    const nodes: NodeRow[] = [];
    this.graph.forEachNode((_id, attributes) => {
      if (attributes.row.layer === layer) nodes.push(attributes.row);
    });
    const edges: EdgeRow[] = [];
    this.graph.forEachEdge((_key, attributes) => {
      if (attributes.row.layer === layer) edges.push(attributes.row);
    });
    return { nodes, edges };
  }

  /**
   * Record a full-row upsert, dropping any earlier partial dirt for the same target. A wholesale
   * upsert replaces the row in memory, so a pending field edit or soft-delete for that target is stale
   * and must not be replayed after the upsert at flush — that would diverge the store from memory.
   */
  private supersede_dirty(target: GraphTarget, upsert: DirtyUpsert): void {
    const key = target_key(target);
    this.dirty_fields.delete(key);
    this.dirty_deletes.delete(key);
    this.dirty_upserts.set(key, upsert);
  }

  private record_field_dirty(
    target: GraphTarget,
    written: string[],
    attributes: Record<string, unknown>,
    as_tier: Tier,
  ): void {
    const key = target_key(target);
    let entry = this.dirty_fields.get(key);
    if (!entry) {
      entry = { target, fields: new Map<string, DirtyField>() };
      this.dirty_fields.set(key, entry);
    }
    for (const field of written) {
      entry.fields.set(field, { value: attributes[field], as_tier });
    }
  }
}

// --- module helpers ----------------------------------------------------------

/**
 * The row's structural layer after a write at `as_tier`: a landed user-tier write promotes the row to
 * `'user'`; every other write leaves the layer unchanged. One-directional — never demotes.
 */
function promoted_layer(current: Layer, as_tier: Tier): Layer {
  return as_tier === "user" ? "user" : current;
}

function target_key(target: GraphTarget): string {
  return `${target.kind}:${target.id}`;
}

function now_iso(): string {
  return new Date().toISOString();
}

/** Deep copy a JSON-shaped value (row, field bag, or provenance) so nothing aliases the model. */
function deep_clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * List-order field-granularity merge for a node: the attribute bag merges per key (later wins), while
 * structural columns take `next` whole. So an id appearing in multiple layers accumulates attributes
 * but adopts the *last* contributing layer's entire structural identity (kind/path/anchor/layer/...).
 */
function merge_node_rows(prev: NodeRow | undefined, next: NodeRow): NodeRow {
  return {
    id: next.id,
    kind: next.kind,
    path: next.path,
    anchor: next.anchor,
    layer: next.layer,
    origin: next.origin,
    intent_source: next.intent_source,
    deleted_at: next.deleted_at,
    attributes: { ...(prev?.attributes ?? {}), ...next.attributes },
    // The read-side fold never consults or stamps ownership; the view carries none.
    field_ownership: {},
  };
}

/** List-order field-granularity merge for an edge: attribute bag per-key, structural columns whole-value. */
function merge_edge_rows(prev: EdgeRow | undefined, next: EdgeRow): EdgeRow {
  return {
    key: next.key,
    src_id: next.src_id,
    dst_id: next.dst_id,
    kind: next.kind,
    confidence: next.confidence,
    layer: next.layer,
    origin: next.origin,
    intent_source: next.intent_source,
    adjudication: next.adjudication,
    deleted_at: next.deleted_at,
    attributes: { ...(prev?.attributes ?? {}), ...next.attributes },
    field_ownership: {},
  };
}
