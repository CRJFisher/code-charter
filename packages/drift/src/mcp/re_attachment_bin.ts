/**
 * The re-attachment bin: user-authored and agentic content that has been detached from the
 * code it described (soft-deleted, never hard-deleted, per the store contract). It is derived
 * purely from the store — soft-deleted non-raw rows — so no new table is introduced. The full
 * bin semantics (resolver-miss + flow-split/merge stranding) land in task-27.1.6; this is the
 * substrate query the `drift.*` surface reads and writes.
 */

import type { GraphStore, Layer } from "@code-charter/types";

/** One entry in the re-attachment bin — a soft-deleted node or edge awaiting resolution. */
export interface DriftBinEntry {
  kind: "node" | "edge";
  /** Node id or edge key. */
  id: string;
  layer: Layer;
  /** The node's file path; null for edges. */
  path: string | null;
  /** ISO-8601 soft-delete timestamp. */
  deleted_at: string;
}

/**
 * The current re-attachment bin: every soft-deleted agentic/user row, optionally narrowed to a
 * path/id `scope` prefix. Raw rows are never in the bin (they are rebuilt, not preserved). On a
 * {@link NullGraphStore} both reads return `[]`, so the bin is empty with no branching here.
 */
export function re_attachment_bin(store: GraphStore, scope?: string): DriftBinEntry[] {
  const nodes = store.all_nodes({ include_deleted: true }).flatMap((node): DriftBinEntry[] => {
    if (node.deleted_at === null || node.layer === "raw") {
      return [];
    }
    if (scope !== undefined && !node.path.startsWith(scope)) {
      return [];
    }
    return [{ kind: "node", id: node.id, layer: node.layer, path: node.path, deleted_at: node.deleted_at }];
  });

  const edges = store.all_edges({ include_deleted: true }).flatMap((edge): DriftBinEntry[] => {
    if (edge.deleted_at === null || edge.layer === "raw") {
      return [];
    }
    if (scope !== undefined && !edge.src_id.startsWith(scope) && !edge.dst_id.startsWith(scope)) {
      return [];
    }
    return [{ kind: "edge", id: edge.key, layer: edge.layer, path: null, deleted_at: edge.deleted_at }];
  });

  return [...nodes, ...edges];
}
