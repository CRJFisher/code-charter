import type { CallGraph } from "@ariadnejs/types";

import type { FlowSummary, RenderedRows } from "./flows";

/**
 * Main interface for Code Charter backend implementations.
 *
 * The surface is flow-keyed (task-27.1.3): the left panel lists flows and renders the selected one as
 * its own bounded subgraph. Entrypoint *detection* (`get_call_graph`) is retained as the substrate the
 * deterministic flow skeleton is generated from.
 */
export interface CodeCharterBackend {
  /** The call graph for the current project — the substrate flows are derived from. */
  get_call_graph(): Promise<CallGraph | undefined>;

  /** The ordered flow list for the left-panel selector: hydrated-first, then by recency (AC#7). */
  list_flows(): Promise<FlowSummary[]>;

  /** The bounded, scaffold-folded subgraph rows for a selected flow (AC#6). */
  render_flow(flow_id: string): Promise<RenderedRows>;

  /** Navigate to a specific document location. */
  navigate_to_doc(file_path: string, line_number: number): Promise<void>;
}
