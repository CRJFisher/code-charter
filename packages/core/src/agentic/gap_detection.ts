/**
 * Deterministic orphan-entrypoint detection over the call graph.
 *
 * An ORPHAN ENTRYPOINT is an entrypoint with no incident documentation edge — the signal that a
 * functionality fragment was spuriously promoted to its own top-level flow by an unresolved call
 * site. The `drift-reconcile --list-entrypoints` inventory flags each changed-neighbourhood
 * entrypoint with this, and the drift-sync skill's stitch phase judges which fragments are one
 * functionality. Detection is pure and byte-stable: doc edges arrive as plain rows (not the store)
 * and the call graph as Ariadne emits it, mirroring `flow.ts`.
 */

import type { CallGraph } from "@ariadnejs/types";
import type { EdgeRow } from "@code-charter/types";

import { LITERAL_DOC_EDGE_KIND } from "../extractors/extractor_ids";
import { flow_id_of } from "../model/flow";

export interface GapDetectionOptions {
  /** Inventory size above which the over-large report fires — a report, never a silent cap. */
  max_per_category?: number;
  include_tests?: boolean;
}

export const DEFAULT_GAP_OPTIONS: Required<GapDetectionOptions> = {
  max_per_category: 200,
  include_tests: false,
};

function doc_incident_paths(doc_edges: readonly EdgeRow[]): Set<string> {
  const incident = new Set<string>();
  for (const edge of doc_edges) {
    if (edge.kind !== LITERAL_DOC_EDGE_KIND || edge.deleted_at !== null) continue;
    // A doc edge documents whichever symbol_path it touches, on either endpoint.
    incident.add(edge.src_id);
    incident.add(edge.dst_id);
  }
  return incident;
}

/** The candidate flow-seed ids (symbol_paths) of every undocumented entrypoint, sorted, deduplicated. */
export function find_orphan_entrypoints(
  graph: CallGraph,
  doc_edges: readonly EdgeRow[],
  options: Required<GapDetectionOptions>,
): string[] {
  const incident = doc_incident_paths(doc_edges);
  const orphans: string[] = [];
  const seen_flow_ids = new Set<string>();
  for (const entry_point of [...graph.entry_points].sort()) {
    const node = graph.nodes.get(entry_point);
    if (!node) continue;
    if (node.is_test && !options.include_tests) continue;
    const flow_id = flow_id_of(node);
    if (incident.has(flow_id)) continue;
    // Two same-named methods on different classes collapse to one v1 symbol_path (D-FLOW-IDENTITY);
    // dedup so each candidate seed id is unique, mirroring build_skeleton_flows.
    if (seen_flow_ids.has(flow_id)) continue;
    seen_flow_ids.add(flow_id);
    orphans.push(flow_id);
  }
  return orphans.sort();
}
