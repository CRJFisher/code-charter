/**
 * Persisting and reading a hydrated flow, scoped. Writes go row-by-row (`upsert` + `write_fields` +
 * stale-edge retirement), never `rebuild_layer('agentic')` — that is store-global and would destroy
 * every *other* flow's agentic content, defeating the lazy, per-flow hydration model (the same reason
 * `re_extract` rebuilds the scaffold with scoped upserts). The agentic layer is still honored: field
 * writes go through `write_fields(..., 'agentic')`, so a user-promoted flow node (a renamed/pinned flow)
 * is preserved by the ladder, never clobbered.
 */

import type { EdgeRow, GraphStore, NodeRow } from "@code-charter/core";
import {
  build_flow_member_edges,
  build_flow_node,
  collect_persisted_flow,
  FLOW_MEMBER_EDGE_KIND,
  FLOW_NODE_KIND,
} from "@code-charter/core";

/** A persisted flow and its incident agentic edges. */
export interface PersistedFlow {
  node: NodeRow;
  member_edges: readonly EdgeRow[];
  bridge_edges: readonly EdgeRow[];
}

/** Read every live persisted `agentic.flow` with its member + incident bridge edges. */
export function read_persisted_flows(store: GraphStore): PersistedFlow[] {
  const edges = store.all_edges();
  return store
    .all_nodes()
    .filter((node) => node.kind === FLOW_NODE_KIND && node.deleted_at === null)
    .map((node) => {
      const rows = collect_persisted_flow(node.id, [node], edges)!;
      return { node: rows.flow_node, member_edges: rows.member_edges, bridge_edges: rows.bridge_edges };
    });
}

/** Read one persisted flow by id, or undefined when it has no live `agentic.flow` node. */
export function read_persisted_flow(store: GraphStore, flow_id: string): PersistedFlow | undefined {
  const rows = collect_persisted_flow(flow_id, store.all_nodes(), store.all_edges());
  return rows === undefined ? undefined : { node: rows.flow_node, member_edges: rows.member_edges, bridge_edges: rows.bridge_edges };
}

export interface WriteFlowArgs {
  id: string;
  label: string;
  /** Seed entrypoint `symbol_path`s — the flow's `entry_points`. */
  seed_paths: readonly string[];
  /** Non-seed members (linked docs) — what `agentic.flow_member` edges point at. Empty for a pure code flow. */
  member_ids: readonly string[];
  rationale: string;
  /** The sorted full induced member set — the stable-identity anchor used by the ≥50% overlap remap (AC#9). */
  anchor_set: readonly string[];
  /** Hash of {@link anchor_set} — a fast equality check for an unchanged flow. */
  anchor_set_hash: string;
  last_synced_at: string;
}

/**
 * Persist (or refresh) one flow: the `agentic.flow` node, its `agentic.flow_member` edges (stale ones
 * retired), and its bridges. Idempotent and deterministic — a re-run with identical input is a clean
 * REPLACE. A user-owned flow node is refreshed through the ladder, never re-upserted.
 */
export function write_flow(store: GraphStore, args: WriteFlowArgs): void {
  const existing = store.all_nodes({ include_deleted: true }).find((n) => n.id === args.id);
  const node = build_flow_node({
    id: args.id,
    label: args.label,
    entry_points: [...args.seed_paths],
    exit_points: [],
    rationale: args.rationale,
    last_synced_at: args.last_synced_at,
  });
  const anchor_set = [...args.anchor_set].sort();
  node.attributes.member_count = anchor_set.length;
  node.attributes.anchor_set = anchor_set;
  node.attributes.anchor_set_hash = args.anchor_set_hash;

  // Establish/replace the node only when it is not user-promoted; a user-owned flow keeps its row and
  // takes agentic refreshes through the ladder (which skips user-owned fields like a renamed label).
  if (existing === undefined || existing.layer !== "user") {
    store.upsert_node(node);
  } else {
    store.write_fields(
      { kind: "node", id: args.id },
      {
        label: args.label,
        entry_points: [...args.seed_paths],
        rationale: args.rationale,
        member_count: anchor_set.length,
        anchor_set,
        anchor_set_hash: args.anchor_set_hash,
        last_synced_at: args.last_synced_at,
      },
      "agentic",
    );
  }

  // Member edges: upsert the fresh set, retire any prior member edge no longer present.
  const fresh = build_flow_member_edges(args.id, args.member_ids);
  const fresh_keys = new Set(fresh.map((e) => e.key));
  for (const stale of store.all_edges()) {
    if (stale.kind === FLOW_MEMBER_EDGE_KIND && stale.src_id === args.id && !fresh_keys.has(stale.key)) {
      store.soft_delete({ kind: "edge", id: stale.key });
    }
  }
  for (const edge of fresh) store.upsert_edge(edge, []);
}
