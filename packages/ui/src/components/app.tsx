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
  set_status_message: React.Dispatch<React.SetStateAction<CodeIndexStatus>>
) {
  set_status_message(CodeIndexStatus.Indexing);

  // Entrypoint detection (the call graph) is retained as the substrate the flow skeleton is built from.
  const call_graph = await backend.get_call_graph();
  if (!call_graph) {
    set_status_message(CodeIndexStatus.Error);
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

  useEffect(() => {
    load_flows(backend, set_flows, set_status_message);
  }, [backend]);

  // Auto-select the top flow on open so a cold repo shows structure without a click (AC#7).
  useEffect(() => {
    if (selected_flow_id === null && flows.length > 0) {
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
            screen_width_fraction={0.8}
            render_flow={backend.render_flow.bind(backend)}
            indexing_status={status_message}
          />
        </div>
      </div>
    </div>
  );
};

export default App;
