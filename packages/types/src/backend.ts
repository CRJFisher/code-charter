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

  /**
   * Subscribe to out-of-band "the underlying store changed" notifications the backend pushes when a
   * reconcile lands (not in response to a request). The listener re-runs list_flows/render_flow so the
   * surface reflects newly stitched umbrellas and descriptions. Returns an unsubscribe function.
   */
  on_store_changed(listener: () => void): () => void;
}
