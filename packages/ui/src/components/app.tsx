import React, { useEffect, useState } from "react";

import Sidebar from "./side_bar";
import { CodeChartAreaReactFlowWrapper as CodeChartArea } from "./code_chart_area/code_chart_area";
import { use_backend } from "../hooks/use_backend";
import { FlowSummary, CodeCharterBackend } from "@code-charter/types";
import { CodeIndexStatus } from "./loading_status";
import { ThemeSwitcher } from "../theme";

async function load_flows(
  backend: CodeCharterBackend,
  set_flows: React.Dispatch<React.SetStateAction<FlowSummary[]>>,
  set_status_message: React.Dispatch<React.SetStateAction<CodeIndexStatus>>,
  // A background refresh (store_changed) reloads the flow list while a flow is already on screen. It
  // must NOT tear the mounted chart down: neither the full-screen Indexing state (which unmounts
  // ReactFlow and discards the viewport) nor the Error state fires on the silent path — a transient
  // failure leaves the existing surface in place. Success still promotes to Ready so a silent refresh
  // recovers a surface that a prior foreground load left in Error.
  silent = false
) {
  if (!silent) {
    set_status_message(CodeIndexStatus.Indexing);
  }

  // The call graph is the substrate flows are derived from; if it is unavailable the flow list
  // cannot be trusted, so the foreground load surfaces an error instead of loading flows. A silent
  // background refresh keeps the current surface rather than blanking it on a transient gap.
  const call_graph = await backend.get_call_graph();
  if (!call_graph) {
    if (!silent) {
      set_status_message(CodeIndexStatus.Error);
    }
    return;
  }

  const flows = await backend.list_flows();
  set_flows(flows);
  set_status_message(CodeIndexStatus.Ready);
}

export interface AppProps {
  class_name?: string;
}

export const App: React.FC<AppProps> = ({ class_name = "" }) => {
  const { backend } = use_backend();
  const [flows, set_flows] = useState<FlowSummary[]>([]);
  const [selected_flow_id, set_selected_flow_id] = useState<string | null>(null);
  const [status_message, set_status_message] = useState<CodeIndexStatus>(CodeIndexStatus.Indexing);
  // Bumped on every store_changed push so the selected flow re-renders in place; the selection and the
  // chart viewport are preserved (the whole point of an in-place refresh over a full webview reload).
  const [refresh_nonce, set_refresh_nonce] = useState(0);

  useEffect(() => {
    load_flows(backend, set_flows, set_status_message);
  }, [backend]);

  // The backend pushes store_changed when the underlying data model moves — a reconcile landing in
  // graph.db out-of-process, or an in-process source edit re-deriving the call graph. Silently re-run
  // list_flows and bump refresh_nonce so newly stitched umbrellas and descriptions appear in place,
  // without a manual Generate Diagram and without unmounting the chart.
  useEffect(() => {
    const unsubscribe = backend.on_store_changed(() => {
      load_flows(backend, set_flows, set_status_message, true);
      set_refresh_nonce((nonce) => nonce + 1);
    });
    return unsubscribe;
  }, [backend]);

  // Auto-select the top flow on open so a cold repo shows structure without a click. Also reconcile a
  // selection that the latest flow list no longer contains (e.g. its seed was renamed), falling back to
  // the top flow rather than stranding a now-unrenderable id.
  useEffect(() => {
    if (flows.length === 0) return;
    if (selected_flow_id === null || !flows.some((flow) => flow.id === selected_flow_id)) {
      set_selected_flow_id(flows[0].id);
    }
  }, [flows, selected_flow_id]);

  return (
    <div className={`flex flex-col h-screen bg-vscodeBg text-vscodeFg ${class_name}`}>
      <div className="flex items-center justify-between p-2 border-b border-vscodeBorder">
        <h1 className="text-lg font-semibold">Code Charter</h1>
        <ThemeSwitcher />
      </div>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          flows={flows}
          on_select={set_selected_flow_id}
          selected_flow_id={selected_flow_id}
        />
        <div className="flex flex-1 bg-vscodeBg">
          <CodeChartArea
            selected_flow_id={selected_flow_id}
            render_flow={backend.render_flow.bind(backend)}
            indexing_status={status_message}
            refresh_nonce={refresh_nonce}
          />
        </div>
      </div>
    </div>
  );
};
