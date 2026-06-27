/**
 * The flow-keyed backend surface.
 *
 * A **flow** is the unit of comprehension: a functionality umbrella over one or more call-graph trees
 * plus linked docs. The left panel lists flows ({@link FlowSummary}) and selecting one renders its
 * bounded subgraph ({@link RenderedRows}). Both shapes are plain data so they cross the webview↔host
 * postMessage boundary without bespoke serialization (unlike `CallGraph`, whose `Map`s need
 * `serialize_call_graph`).
 */

import type { EdgeRow, NodeRow } from "./graph_store";

/** The rows a single flow renders to — the shape the webview's `custom_graph_to_react_flow` adapter consumes. */
export interface RenderedRows {
  nodes: NodeRow[];
  edges: EdgeRow[];
}

export interface FlowSummary {
  /**
   * Stable flow id = the `symbol_path` of the dominant seed entrypoint — the location-free,
   * body-independent half of the seed's anchor, so the id is stable across edits and line shifts. The
   * single `unattributed` bucket carries a fixed sentinel id instead (it has no seed entrypoint).
   */
  id: string;
  /** The dominant seed's name for a skeleton flow; the agent label once hydrated. */
  label: string;
  /** Drives hydrated-first ordering of the selector. */
  is_hydrated: boolean;
  /** The hydrated flow node's `attributes.last_synced_at`; null for a never-hydrated skeleton flow. */
  last_synced_at: string | null;
  /** Reachable subgraph size — the secondary sort key and a large-flow hint. */
  member_count: number;
  /** True for the single deterministic `unattributed` bucket. */
  is_unattributed: boolean;
  /** The dominant seed's definition location, for jump-to-source on select; null for `unattributed`. */
  seed_location: { file_path: string; line_number: number } | null;
}
