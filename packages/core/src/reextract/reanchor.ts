/**
 * task-27.1.2 AC#4 — commit a staged relocation by re-anchoring a preserved node onto the symbol the
 * resolver relocated it to.
 *
 * The write touches only the structural `anchor` column and clears the `drift_*` staging attributes;
 * the node keeps its id, layer, and every authored field — so a `user`-owned `description` rides across
 * the rename byte-for-byte untouched. This is the single re-anchor write, called both by
 * `drift.resolve` (the user-facing accept) and by any future auto-sync path.
 */

import type { Anchor, GraphStore, NodeRow } from "@code-charter/types";

import { format_anchor } from "../resolver";
import { DRIFT_STAGING_KEYS } from "./drift_observation";

/**
 * Re-anchor `node` onto `target`. Strips the reserved drift-staging attributes (and their ownership
 * stamps), rewrites `anchor`, and leaves everything else — including the authored `description` and its
 * `user` ownership — exactly as it was. Idempotent: re-running with the same target is a no-op REPLACE.
 */
export function reanchor_node(store: GraphStore, node: NodeRow, target: Anchor): void {
  const attributes = { ...node.attributes };
  const field_ownership = { ...node.field_ownership };
  for (const key of DRIFT_STAGING_KEYS) {
    delete attributes[key];
    delete field_ownership[key];
  }
  store.upsert_node({ ...node, anchor: format_anchor(target), attributes, field_ownership });
}
