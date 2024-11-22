import React from "react";
import { useEffect, useState } from "react";
import "./App.css";
import Sidebar from "./SideBar";
import { CodeChartArea } from "./codeChartArea/CodeChartArea";
import { clusterCodeTree, detectEnvironments, getCallGraphForEnvironment, summariseCodeTree } from "./vscodeApi";
import {
  CallGraph,
  DefinitionNode,
  NodeGroup,
  ProjectEnvironmentId,
  TreeAndContextSummaries,
} from "../../shared/codeGraph";
import { CodeIndexStatus } from "./codeIndex";

async function detectEntryPoints(
  setCallGraph: React.Dispatch<React.SetStateAction<CallGraph>>,
  setStatusMessage: React.Dispatch<React.SetStateAction<CodeIndexStatus>>
) {
  console.log("detectEntryPoints");

  setStatusMessage(CodeIndexStatus.Indexing);

  const environments = await detectEnvironments();

  if (!environments || environments.length === 0) {
    setStatusMessage(CodeIndexStatus.Error);
    return;
  }

  let selectedEnvironment: ProjectEnvironmentId;
  if (environments.length > 1) {
    // TODO: implement select
    setStatusMessage(CodeIndexStatus.Error);
    // selectedEnvironment = environments.find((env) => env.displayName() === picked);
    return;
  } else {
    selectedEnvironment = environments[0];
  }

  const callGraph = await getCallGraphForEnvironment(selectedEnvironment);

  if (!callGraph) {
    setStatusMessage(CodeIndexStatus.Error);
    return;
  }
  setCallGraph(callGraph);

  setStatusMessage(CodeIndexStatus.Ready);
}

async function clusterNodes(
  topLevelNodeSymbol: string | undefined,
  setNodeGroups: React.Dispatch<React.SetStateAction<{ [key: string]: NodeGroup[] }>>
): Promise<void> {
  if (!topLevelNodeSymbol) {
    return;
  }
  const newNodeGroups = await clusterCodeTree(topLevelNodeSymbol);
  setNodeGroups((nodeGroups) => {
    return { ...nodeGroups, [topLevelNodeSymbol]: newNodeGroups };
  });
}

async function fetchSummaries(
  nodeSymbol: string,
  ongoingSummarisations: Map<string, Promise<any>>,
  setOnGoingSummarisations: React.Dispatch<React.SetStateAction<Map<string, Promise<any>>>>
): Promise<TreeAndContextSummaries | undefined> {
  if (ongoingSummarisations.has(nodeSymbol)) {
    return ongoingSummarisations.get(nodeSymbol);
  }

  const promise = summariseCodeTree(nodeSymbol)
    .then((summaries) => summaries)
    .finally(() =>
      setOnGoingSummarisations((ongoingSummarisations) => {
        ongoingSummarisations.delete(nodeSymbol);
        return new Map(ongoingSummarisations);
      })
    );

  setOnGoingSummarisations(new Map(ongoingSummarisations.set(nodeSymbol, promise)));
  return promise;
}

const App: React.FC = () => {
  const [callGraph, setCallGraph] = useState<CallGraph>({ topLevelNodes: [], definitionNodes: {} });
  const [nodeGroups, setNodeGroups] = useState<{ [key: string]: NodeGroup[] }>({});
  const [selectedEntryPoint, setSelectedEntryPoint] = useState<DefinitionNode | null>(null);
  const [statusMessage, setStatusMessage] = useState<CodeIndexStatus>(CodeIndexStatus.Indexing);
  const [ongoingSummarisations, setOnGoingSummarisations] = useState<Map<string, Promise<any>>>(new Map());

  useEffect(() => {
    detectEntryPoints(setCallGraph, setStatusMessage);
  }, []);

  const areNodesSummariesLoading = (nodeSymbol: string) => {
    return ongoingSummarisations.has(nodeSymbol);
  };

  const getSummaries = async (nodeSymbol: string) => {
    return fetchSummaries(nodeSymbol, ongoingSummarisations, setOnGoingSummarisations);
  };

  const selectedNodeGroups = nodeGroups[selectedEntryPoint?.symbol || ""]; // TODO: could provide default values of [] for all top level nodes in order to avoid passing undefined when something is selected
  return (
    <div className="flex flex-col h-screen bg-vscodeBg text-vscodeFg">
      <button
        className="p-2 bg-vscodeFg text-vscodeBg"
        onClick={() => clusterNodes(selectedEntryPoint?.symbol, setNodeGroups)}
      >
        Cluster
      </button>
      <div className="flex flex-1 overflow-hidden border-t border-vscodeBorder">
        <Sidebar
          callGraph={callGraph}
          onSelect={setSelectedEntryPoint}
          selectedNode={selectedEntryPoint}
          indexingStatus={statusMessage}
          areNodeSummariesLoading={areNodesSummariesLoading}
        />
        <div className="flex flex-1 bg-vscodeBg">
          <CodeChartArea
            selectedEntryPoint={selectedEntryPoint}
            nodeGroups={selectedNodeGroups}
            screenWidthFraction={0.75}
            getSummaries={getSummaries}
          />
        </div>
      </div>
    </div>
  );
};

export default App;
