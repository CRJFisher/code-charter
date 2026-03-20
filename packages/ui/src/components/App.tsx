import React, { useEffect, useState } from "react";
import "./App.css";
import Sidebar from "./side_bar";
import { CodeChartAreaReactFlowWrapper as CodeChartArea } from "./code_chart_area/code_chart_area_react_flow";
import { useBackend } from "../hooks/use_backend";
import { DocstringSummaries, NodeGroup, CallGraph, CallableNode } from "@code-charter/types";
import { CodeIndexStatus } from "./loading_status";
import { ThemeSwitcher } from "../theme";

async function detect_entry_points(
  backend: any,
  set_call_graph: React.Dispatch<React.SetStateAction<CallGraph | null>>,
  set_status_message: React.Dispatch<React.SetStateAction<CodeIndexStatus>>
) {
  set_status_message(CodeIndexStatus.Indexing);

  const call_graph = await backend.getCallGraph();

  if (!call_graph) {
    set_status_message(CodeIndexStatus.Error);
    return;
  }
  set_call_graph(call_graph);

  set_status_message(CodeIndexStatus.Ready);
}

async function fetch_descriptions(
  backend: any,
  node_symbol: string,
  ongoing_tasks: Map<string, Promise<any>>,
  set_ongoing_descriptions: React.Dispatch<React.SetStateAction<Map<string, Promise<any>>>>
): Promise<any> {
  if (ongoing_tasks.has(node_symbol)) {
    return ongoing_tasks.get(node_symbol);
  }

  const promise = backend.get_code_tree_descriptions(node_symbol)
    .then((descriptions: DocstringSummaries) => descriptions)
    .finally(() =>
      set_ongoing_descriptions((ongoing_descriptions) => {
        ongoing_descriptions.delete(node_symbol);
        return new Map(ongoing_descriptions);
      })
    );

  set_ongoing_descriptions(new Map(ongoing_tasks.set(node_symbol, promise)));
  return promise;
}

export interface AppProps {
  className?: string;
  forceStandalone?: boolean;
}

export const App: React.FC<AppProps> = ({ className = "", forceStandalone = false }) => {
  const { backend } = useBackend();
  const [call_graph, set_call_graph] = useState<CallGraph | null>(null);
  const [selected_entry_point, set_selected_entry_point] = useState<CallableNode | null>(null);
  const [status_message, set_status_message] = useState<CodeIndexStatus>(CodeIndexStatus.Indexing);
  const [ongoing_descriptions, set_ongoing_descriptions] = useState<Map<string, Promise<any>>>(new Map());

  useEffect(() => {
    detect_entry_points(backend, set_call_graph, set_status_message);
  }, [backend]);

  const are_nodes_descriptions_loading = (node_symbol: string) => {
    return ongoing_descriptions.has(node_symbol);
  };

  const get_descriptions = async (node_symbol: string): Promise<DocstringSummaries | undefined> => {
    return fetch_descriptions(backend, node_symbol, ongoing_descriptions, set_ongoing_descriptions);
  };

  async function detect_modules(top_level_node_symbol: string | undefined): Promise<NodeGroup[] | undefined> {
    if (!top_level_node_symbol) {
      return;
    }
    const new_node_groups = await backend.clusterCodeTree(top_level_node_symbol);
    return new_node_groups;
  }

  return (
    <div className={`flex flex-col h-screen bg-vscodeBg text-vscodeFg ${className}`}>
      <div className="flex items-center justify-between p-2 border-b border-vscodeBorder">
        <h1 className="text-lg font-semibold">Code Charter</h1>
        <ThemeSwitcher />
      </div>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          call_graph={call_graph || { nodes: new Map(), entry_points: [] }}
          on_select={set_selected_entry_point}
          selected_node={selected_entry_point}
          are_node_descriptions_loading={are_nodes_descriptions_loading}
        />
        <div className="flex flex-1 bg-vscodeBg">
          <CodeChartArea
            selectedEntryPoint={selected_entry_point}
            screenWidthFraction={0.8}
            getDescriptions={get_descriptions}
            detectModules={() => detect_modules(selected_entry_point?.symbol_id)}
            indexingStatus={status_message}
          />
        </div>
      </div>
    </div>
  );
};

export default App;
