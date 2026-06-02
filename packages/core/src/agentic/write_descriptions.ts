/**
 * task-27.1.4 AC#3 — persist behaviour descriptions on the agentic lane, surviving re-extraction.
 *
 * A description is written as a separate `agentic.description` node, one per described code symbol,
 * anchored to that symbol's `symbol_path:content_hash`. This is the codebase's established pattern for
 * preserved content (cf. the round-trip fixture's `agentic.behaviour` node) and it is what makes a
 * description survive a re-parse: `invalidate_nodes_for_files` and `rebuild_layer('raw')` delete only
 * `layer='raw'` rows, so the agentic side-node is untouched, and `re_extract` re-anchors it through
 * its existing preserved-node reconciliation when the described symbol is renamed or moved.
 *
 * Writes go through `write_fields(..., 'agentic')`, so a user-edited description (its node promoted to
 * `layer='user'`) is preserved by the field ladder — "user override wins." The side-node is never
 * re-upserted while it is user-owned (an upsert would reset its layer); the description is refreshed
 * through the ladder instead.
 */

import type { GraphStore } from "@code-charter/types";

import { format_anchor } from "../resolver";
import type { DescriptionSource } from "./describe_policy";

/** The kind for the side-node carrying an agentic behaviour description. */
export const DESCRIPTION_NODE_KIND = "agentic.description";

/** The stable side-node id for a described symbol. */
export function description_node_id(symbol_path: string): string {
  return `${DESCRIPTION_NODE_KIND}:${symbol_path}`;
}

/** A description resolved to final text — from a docstring, the LLM, or the name placeholder. */
export interface ResolvedDescription {
  symbol_path: string;
  content_hash: string;
  /** The described symbol's file path, so `re_extract` reconciles the side-node's anchor. */
  file_path: string;
  text: string;
  source: DescriptionSource;
}

export interface WriteDescriptionsResult {
  /** symbol_paths whose description was written at the agentic tier. */
  written: string[];
  /** symbol_paths whose description was user-owned and therefore preserved (not overwritten). */
  skipped: string[];
}

/**
 * Persist resolved descriptions as `agentic.description` side-nodes. Returns which landed and which
 * were preserved as user-owned. Deterministic: members are processed in sorted symbol_path order.
 */
export function write_descriptions(
  store: GraphStore,
  resolved: readonly ResolvedDescription[],
): WriteDescriptionsResult {
  const written: string[] = [];
  const skipped: string[] = [];
  const ordered = [...resolved].sort((a, b) => (a.symbol_path < b.symbol_path ? -1 : a.symbol_path > b.symbol_path ? 1 : 0));

  for (const item of ordered) {
    const id = description_node_id(item.symbol_path);
    const existing = store.node(id);
    // Re-upsert (re-anchor) only when the node is agentic-owned; never demote a user-promoted node.
    if (!existing || existing.layer !== "user") {
      store.upsert_node({
        id,
        kind: DESCRIPTION_NODE_KIND,
        path: item.file_path,
        anchor: format_anchor({ symbol_path: item.symbol_path, content_hash: item.content_hash }),
        layer: "agentic",
        attributes: {},
        field_ownership: {},
        origin: "describe-policy",
        intent_source: "code-edit",
        deleted_at: null,
      });
    }
    const result = store.write_fields(
      { kind: "node", id },
      { description: item.text, description_hash: item.content_hash, description_source: item.source },
      "agentic",
    );
    if (result.skipped.includes("description")) skipped.push(item.symbol_path);
    else written.push(item.symbol_path);
  }

  return { written, skipped };
}
