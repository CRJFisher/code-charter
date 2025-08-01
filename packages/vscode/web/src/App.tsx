import React from "react";
import { useEffect, useState } from "react";
import "./App.css";
import Sidebar from "./SideBar";
import { CodeChartArea } from "./codeChartArea/CodeChartArea";
import { clusterCodeTree as clusterAndSummariseCodeTree, getCallGraph, summariseCodeTree } from "./vscodeApi";
import { CallGraph, CallGraphNode } from "@ariadnejs/core";

// Import local types from vscodeApi where they are now defined
import type { NodeGroup, TreeAndContextSummaries } from "./vscodeApi";
import { CodeIndexStatus } from "./loadingStatus";

async function detectEntryPoints(
  setCallGraph: React.Dispatch<React.SetStateAction<CallGraph | null>>,
  setStatusMessage: React.Dispatch<React.SetStateAction<CodeIndexStatus>>
) {
  setStatusMessage(CodeIndexStatus.Indexing);

  const callGraph = await getCallGraph();

  if (!callGraph) {
    setStatusMessage(CodeIndexStatus.Error);
    return;
  }
  setCallGraph(callGraph);

  setStatusMessage(CodeIndexStatus.Ready);
}

async function fetchSummaries(
  nodeSymbol: string,
  ongoingTasks: Map<string, Promise<any>>,
  setOnGoingSummarisations: React.Dispatch<React.SetStateAction<Map<string, Promise<any>>>>
): Promise<any> {
  if (ongoingTasks.has(nodeSymbol)) {
    return ongoingTasks.get(nodeSymbol);
  }

  const promise = summariseCodeTree(nodeSymbol)
    .then((summaries) => summaries)
    .finally(() =>
      setOnGoingSummarisations((ongoingSummarisations) => {
        ongoingSummarisations.delete(nodeSymbol);
        return new Map(ongoingSummarisations);
      })
    );

  setOnGoingSummarisations(new Map(ongoingTasks.set(nodeSymbol, promise)));
  return promise;
}

const App: React.FC = () => {
  const [callGraph, setCallGraph] = useState<CallGraph | null>(null);
  const [selectedEntryPoint, setSelectedEntryPoint] = useState<CallGraphNode | null>(null);
  const [statusMessage, setStatusMessage] = useState<CodeIndexStatus>(CodeIndexStatus.Indexing);
  const [ongoingSummarisations, setOnGoingSummarisations] = useState<Map<string, Promise<any>>>(new Map());

  useEffect(() => {
    detectEntryPoints(setCallGraph, setStatusMessage);
  }, []);

  const areNodesSummariesLoading = (nodeSymbol: string) => {
    return ongoingSummarisations.has(nodeSymbol);
  };

  const getSummaries = async (nodeSymbol: string): Promise<TreeAndContextSummaries | undefined> => {
    return fetchSummaries(nodeSymbol, ongoingSummarisations, setOnGoingSummarisations);
  };

  async function detectModules(topLevelNodeSymbol: string | undefined): Promise<NodeGroup[] | undefined> {
    if (!topLevelNodeSymbol) {
      return;
    }
    const newNodeGroups = await clusterAndSummariseCodeTree(topLevelNodeSymbol);
    return newNodeGroups;
  }

  return (
    <div className="flex flex-col h-screen bg-vscodeBg text-vscodeFg">
      <div className="flex flex-1 overflow-hidden border-t border-vscodeBorder">
        <Sidebar
          callGraph={callGraph || { nodes: new Map(), top_level_nodes: [], edges: [] }}
          onSelect={setSelectedEntryPoint}
          selectedNode={selectedEntryPoint}
          areNodeSummariesLoading={areNodesSummariesLoading}
        />
        <div className="flex flex-1 bg-vscodeBg">
          <CodeChartArea
            selectedEntryPoint={selectedEntryPoint}
            screenWidthFraction={0.8}
            getSummaries={getSummaries}
            detectModules={() => detectModules(selectedEntryPoint?.symbol)}
            indexingStatus={statusMessage}
          />
        </div>
      </div>
    </div>
  );
};

export default App;
