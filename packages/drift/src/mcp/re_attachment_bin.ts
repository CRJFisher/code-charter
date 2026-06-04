/**
 * The re-attachment bin: user-authored and agentic content that has been detached from the
 * code it described (soft-deleted, never hard-deleted, per the store contract). It is derived
 * purely from the store — soft-deleted non-raw rows — so no new table is introduced. The full
 * bin semantics (resolver-miss + flow-split/merge stranding) land in task-27.1.6; this is the
 * substrate query the `drift.*` surface reads and writes.
 *
 * Derived structural rows (the file-module scaffold, `origin: 'module-scaffold'`) are excluded:
 * they are recomputed from the code, not authored, so a retired scaffold edge is never a
 * re-attachment candidate. A clean relocation is NOT in the bin either — it stays live with staged
 * `drift_*` attributes (see `@code-charter/core`'s `outstanding_drift`) and is committed via
 * `drift.resolve {reanchor}`; the bin holds only unrecoverable misses.
 */

import { MODULE_SCAFFOLD_ORIGIN } from "@code-charter/core";
import type { GraphStore, Layer } from "@code-charter/types";

/**
 * One entry in the re-attachment bin — a soft-deleted node or edge awaiting resolution. The payload
 * answers the two questions a chooser needs: *what am I about to recover* (`description` carries the
 * stranded authored text; `node_kind` and `intent_source` say what kind of thing it is) and *is it
 * hand-authored and so irreplaceable* (`user_authored`). All of it reads off the soft-deleted row that
 * is already in hand — no extra query, no schema change.
 */
export interface DriftBinEntry {
  kind: "node" | "edge";
  /** Node id or edge key. */
  id: string;
  layer: Layer;
  /** The node's file path; null for edges. */
  path: string | null;
  /** ISO-8601 soft-delete timestamp. */
  deleted_at: string;
  /** The row's namespaced kind (e.g. `user.description`, `agentic.flow`); null for edges. */
  node_kind: string | null;
  /** The stranded authored description text being recovered, when the row carries one; else null. */
  description: string | null;
  /** True when the `description` field is user-owned — hand-authored content, not regenerable agentic. */
  user_authored: boolean;
  /** Provenance of the row (e.g. `explicit-pin`, `code-edit`). */
  intent_source: string;
}

/**
 * The current re-attachment bin: every soft-deleted agentic/user row, optionally narrowed to a
 * path/id `scope` prefix. Raw rows are never in the bin (they are rebuilt, not preserved). On a
 * {@link NullGraphStore} both reads return `[]`, so the bin is empty with no branching here.
 */
export function re_attachment_bin(store: GraphStore, scope?: string): DriftBinEntry[] {
  const nodes = store.all_nodes({ include_deleted: true }).flatMap((node): DriftBinEntry[] => {
    if (node.deleted_at === null || node.layer === "raw" || node.origin === MODULE_SCAFFOLD_ORIGIN) {
      return [];
    }
    if (scope !== undefined && !node.path.startsWith(scope)) {
      return [];
    }
    const description = typeof node.attributes.description === "string" ? node.attributes.description : null;
    return [
      {
        kind: "node",
        id: node.id,
        layer: node.layer,
        path: node.path,
        deleted_at: node.deleted_at,
        node_kind: node.kind,
        description,
        user_authored: node.field_ownership.description === "user",
        intent_source: node.intent_source,
      },
    ];
  });

  const edges = store.all_edges({ include_deleted: true }).flatMap((edge): DriftBinEntry[] => {
    if (edge.deleted_at === null || edge.layer === "raw" || edge.origin === MODULE_SCAFFOLD_ORIGIN) {
      return [];
    }
    if (scope !== undefined && !edge.src_id.startsWith(scope) && !edge.dst_id.startsWith(scope)) {
      return [];
    }
    return [
      {
        kind: "edge",
        id: edge.key,
        layer: edge.layer,
        path: null,
        deleted_at: edge.deleted_at,
        node_kind: null,
        description: null,
        user_authored: false,
        intent_source: edge.intent_source,
      },
    ];
  });

  return [...nodes, ...edges];
}
