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
 *
 * Entries are returned in a deterministic recovery order — oldest stranding first (`deleted_at`),
 * then `id` — so `drift.list` and `drift.next` agree on "the next entry" to work (task-27.1.6.3 AC#4).
 */

import { MODULE_SCAFFOLD_ORIGIN, parse_anchor, rank_candidates, type RankedCandidate } from "@code-charter/core";
import type { GraphStore, Layer, NodeRow } from "@code-charter/types";

/** A ranked plausible new target for a stranded entry — a live code symbol it could re-attach onto. */
export type DriftCandidate = RankedCandidate;

/**
 * One entry in the re-attachment bin — a soft-deleted node or edge awaiting resolution. The payload
 * answers the two questions a chooser needs: *what am I about to recover* (`description` carries the
 * stranded authored text; `node_kind` and `intent_source` say what kind of thing it is) and *is it
 * hand-authored and so irreplaceable* (`user_authored`). It also carries `candidates` — ranked live
 * symbols the stranded content could be re-attached onto via `drift.resolve {reattach, target}` — so a
 * chooser can pick a new target from the listing alone. All of it reads off rows already in hand — no
 * extra query, no schema change.
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
  /** Ranked plausible new targets (live code symbols), strongest first; `[]` for edges and unanchored nodes. */
  candidates: DriftCandidate[];
}

// Edges carry no authored description, so `node_kind`/`description` are null and `user_authored` is
// false by definition (not a signal that the edge is regenerable) — only `intent_source` is meaningful.
// Edges have no anchor to match against the live symbols either, so `candidates` is always empty.

/**
 * The current re-attachment bin: every soft-deleted agentic/user row, optionally narrowed to a
 * path/id `scope` prefix, in `(deleted_at, id)` recovery order. Raw rows are never in the bin (they
 * are rebuilt, not preserved). On a {@link NullGraphStore} both reads return `[]`, so the bin is empty
 * with no branching here.
 */
export function re_attachment_bin(store: GraphStore, scope?: string): DriftBinEntry[] {
  const live_targets = live_anchored_targets(store);

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
        candidates: node.anchor === null ? [] : rank_candidates(parse_anchor(node.anchor), live_targets),
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
        candidates: [],
      },
    ];
  });

  return [...nodes, ...edges].sort(
    (a, b) => (a.deleted_at < b.deleted_at ? -1 : a.deleted_at > b.deleted_at ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/**
 * The live code symbols a stranded entry can re-attach onto: every live `raw`-layer anchored node,
 * whose id is its `symbol_path` (so `drift.resolve`'s `store.node(target)` lookup resolves). Inverts
 * the bin's raw-exclusion — raw rows are not *recoverable content*, but they ARE the re-attach
 * *targets*. A corrupt anchor on one live row is skipped so it cannot sink the whole listing.
 */
function live_anchored_targets(store: GraphStore): { symbol_path: string; content_hash: string }[] {
  return store.all_nodes().flatMap((node: NodeRow) => {
    if (node.layer !== "raw" || node.anchor === null) {
      return [];
    }
    try {
      return [parse_anchor(node.anchor)];
    } catch {
      return [];
    }
  });
}
