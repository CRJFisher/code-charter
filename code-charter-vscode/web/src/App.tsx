import React from "react";
import { useEffect, useState } from "react";
import "./App.css";
import Sidebar from "./SideBar";
import { CodeChartArea } from "./codeChartArea/CodeChartArea";
import {
  clusterCodeTree as clusterAndSummariseCodeTree,
  detectEnvironments,
  getCallGraphForEnvironment,
  summariseCodeTree,
} from "./vscodeApi";
import {
  CallGraph,
  DefinitionNode,
  NodeGroup,
  ProjectEnvironmentId,
  TreeAndContextSummaries,
} from "../../shared/codeGraph";
import { CodeIndexStatus } from "./loadingStatus";

async function detectEntryPoints(
  setCallGraph: React.Dispatch<React.SetStateAction<CallGraph>>,
  setStatusMessage: React.Dispatch<React.SetStateAction<CodeIndexStatus>>
) {
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
  const [callGraph, setCallGraph] = useState<CallGraph>({ topLevelNodes: [], definitionNodes: {} });
  const [selectedEntryPoint, setSelectedEntryPoint] = useState<DefinitionNode | null>(null);
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
          callGraph={callGraph}
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
