import type { CallGraph } from "@ariadnejs/types";

import type { FlowSummary, RenderedRows } from "./flows";

/**
 * The data-source boundary between the webview UI and its backend.
 *
 * The surface is flow-keyed: the left panel lists flows and renders the selected one as its own
 * bounded subgraph. The call graph is the substrate the deterministic flow skeleton is generated from.
 */
export interface CodeCharterBackend {
  get_call_graph(): Promise<CallGraph | undefined>;

  /** Ordered hydrated-first, then by recency, for stable left-panel selector display. */
  list_flows(): Promise<FlowSummary[]>;

  render_flow(flow_id: string): Promise<RenderedRows>;

  navigate_to_doc(file_path: string, line_number: number): Promise<void>;
}
