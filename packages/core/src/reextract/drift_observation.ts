/**
 * task-27.1.2 AC#3/#5 — outstanding drift, derived from the store.
 *
 * When {@link re_extract} resolves a preserved node's anchor to a `relocated` verdict, it does not
 * rewrite the anchor inline. Instead it stages the resolver-determined target on the node under the
 * reserved `drift_*` attribute keys below and leaves the node live but drifted. The node stays drifted
 * — surfaced at session open and re-anchored on accept — until `drift.resolve` commits it.
 *
 * Staging the target on the node (rather than persisting a fresh resolver pass) means the session-open
 * banner and the `drift.resolve` accept both read outstanding drift from the store alone, with no need
 * to re-run the extractor: the expensive resolve happened once, out-of-band, inside `re_extract`.
 */

import type { GraphStore } from "@code-charter/types";

/** The node's structural drift state. Set to {@link DRIFT_STATUS_RELOCATED} while a re-anchor is pending. */
export const DRIFT_STATUS_KEY = "drift_status";
/** The `symbol_path` the node was anchored to before the move (for the punch-list line). */
export const DRIFT_FROM_KEY = "drift_from_symbol_path";
/** The `symbol_path` the resolver relocated the anchor to — the re-anchor target. */
export const DRIFT_TO_SYMBOL_PATH_KEY = "drift_to_symbol_path";
/** The `content_hash` at the relocated symbol — the re-anchor target. */
export const DRIFT_TO_CONTENT_HASH_KEY = "drift_to_content_hash";

export const DRIFT_STATUS_RELOCATED = "relocated";

/** Every reserved drift-staging attribute key, stripped from a node when its re-anchor is committed. */
export const DRIFT_STAGING_KEYS: readonly string[] = [
  DRIFT_STATUS_KEY,
  DRIFT_FROM_KEY,
  DRIFT_TO_SYMBOL_PATH_KEY,
  DRIFT_TO_CONTENT_HASH_KEY,
];

/** One outstanding, not-yet-accepted relocation a session surfaces and `drift.resolve` can commit. */
export interface DriftObservation {
  node_id: string;
  from_symbol_path: string;
  to_symbol_path: string;
  to_content_hash: string;
  reason: "relocated";
}

/**
 * Every live node carrying a staged relocation, optionally narrowed to a `scope` path prefix. Read-only
 * and extractor-free: it reads what {@link re_extract} already staged. Soft-deleted rows are excluded
 * (a deleted node is in the re-attachment bin, a separate surface).
 */
export function outstanding_drift(store: GraphStore, scope?: string): DriftObservation[] {
  return store.all_nodes().flatMap((node): DriftObservation[] => {
    if (node.attributes[DRIFT_STATUS_KEY] !== DRIFT_STATUS_RELOCATED) return [];
    if (scope !== undefined && !node.path.startsWith(scope)) return [];
    const from = node.attributes[DRIFT_FROM_KEY];
    const to = node.attributes[DRIFT_TO_SYMBOL_PATH_KEY];
    const to_hash = node.attributes[DRIFT_TO_CONTENT_HASH_KEY];
    if (typeof from !== "string" || typeof to !== "string" || typeof to_hash !== "string") return [];
    return [{ node_id: node.id, from_symbol_path: from, to_symbol_path: to, to_content_hash: to_hash, reason: "relocated" }];
  });
}
