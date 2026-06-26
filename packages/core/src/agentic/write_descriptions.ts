/**
 * Persist behaviour descriptions on the agentic lane, surviving re-extraction.
 *
 * A description is written as a separate `agentic.description` node, one per described code symbol,
 * anchored to that symbol's `symbol_path:content_hash`. This is what makes a description survive a
 * re-parse: `invalidate_nodes_for_files` and `rebuild_layer('raw')` delete only `layer='raw'` rows, so
 * the agentic side-node is untouched, and `re_extract` re-anchors it through its existing reconciliation
 * when the described symbol is renamed or moved.
 *
 * Descriptions are agent-generated, so the side-node is always (re)upserted live at `layer='agentic'`
 * with `deleted_at: null`: this resurrects a soft-deleted node and overwrites any prior content, so a
 * stranded agentic description is regenerated rather than lost. The text and its content-hash cache-key
 * siblings are then written at the agentic tier.
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
}

/**
 * Persist resolved descriptions as `agentic.description` side-nodes, returning which were written.
 * Deterministic: members are processed in sorted symbol_path order.
 */
export function write_descriptions(
  store: GraphStore,
  resolved: readonly ResolvedDescription[],
): WriteDescriptionsResult {
  const written: string[] = [];
  const ordered = [...resolved].sort((a, b) => (a.symbol_path < b.symbol_path ? -1 : a.symbol_path > b.symbol_path ? 1 : 0));

  for (const item of ordered) {
    const id = description_node_id(item.symbol_path);
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
    store.write_fields(
      { kind: "node", id },
      { description: item.text, description_hash: item.content_hash, description_source: item.source },
      "agentic",
    );
    written.push(item.symbol_path);
  }

  return { written };
}
