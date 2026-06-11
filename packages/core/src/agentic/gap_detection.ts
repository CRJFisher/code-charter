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

import type { CallGraph, SymbolId } from "@ariadnejs/types";
import type { EdgeRow } from "@code-charter/types";

import { LITERAL_DOC_EDGE_KIND } from "../extractors/extractor_ids";
import { flow_id_of } from "../model/flow";

export interface GapDetectionOptions {
  /** Inventory size above which the over-large report fires (never a silent cap). Default 200. */
  max_per_category?: number;
  /** Include `is_test` nodes as orphan candidates. Default false. */
  include_tests?: boolean;
}

export const DEFAULT_GAP_OPTIONS: Required<GapDetectionOptions> = {
  max_per_category: 200,
  include_tests: false,
};

export interface OrphanEntrypoint {
  symbol_id: SymbolId;
  /** `flow_id_of(node)` — the symbol_path; the candidate flow-seed id. */
  flow_id: string;
  name: string;
  location: { file_path: string; line_number: number };
}

function cmp_str(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The set of symbol_paths incident to a live `code.literal-doc` edge (either endpoint). */
function doc_incident_paths(doc_edges: readonly EdgeRow[]): Set<string> {
  const incident = new Set<string>();
  for (const edge of doc_edges) {
    if (edge.kind !== LITERAL_DOC_EDGE_KIND || edge.deleted_at !== null) continue;
    incident.add(edge.src_id);
    incident.add(edge.dst_id);
  }
  return incident;
}

export function find_orphan_entrypoints(
  graph: CallGraph,
  doc_edges: readonly EdgeRow[],
  options: Required<GapDetectionOptions>,
): OrphanEntrypoint[] {
  const incident = doc_incident_paths(doc_edges);
  const orphans: OrphanEntrypoint[] = [];
  const seen_flow_ids = new Set<string>();
  for (const entry_point of [...graph.entry_points].sort()) {
    const node = graph.nodes.get(entry_point);
    if (!node) continue;
    if (node.is_test && !options.include_tests) continue;
    const flow_id = flow_id_of(node);
    if (incident.has(flow_id)) continue;
    // De-duplicate by flow_id, as build_skeleton_flows does: two same-named methods on different
    // classes collapse to one v1 symbol_path (D-FLOW-IDENTITY), and a candidate seed id must be unique.
    if (seen_flow_ids.has(flow_id)) continue;
    seen_flow_ids.add(flow_id);
    orphans.push({
      symbol_id: entry_point,
      flow_id,
      name: node.name,
      location: { file_path: node.location.file_path, line_number: node.location.start_line },
    });
  }
  return orphans.sort((a, b) => cmp_str(a.flow_id, b.flow_id));
}
