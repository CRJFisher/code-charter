import React from 'react';
import { useEffect, useState } from 'react';
import './App.css';
import Sidebar from './SideBar';
import { CodeChartArea } from './CodeChartArea';
import { detectEnvironments, getCallGraphForEnvironment } from './vscodeApi';
import { CallGraph, DefinitionNode, ProjectEnvironmentId } from "../../shared/codeGraph";
import { CodeIndexStatus } from './codeIndex';

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

const App: React.FC = () => {
  const [callGraph, setCallGraph] = useState<CallGraph>({ topLevelNodes: [], definitionNodes: {} });
  const [selectedEntryPoint, setSelectedEntryPoint] = useState<DefinitionNode | null>(null);
  const [statusMessage, setStatusMessage] = useState<CodeIndexStatus>(CodeIndexStatus.Indexing);

  useEffect(() => {
    detectEntryPoints(setCallGraph, setStatusMessage);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-vscodeBg text-vscodeFg">
      <div className="flex flex-1 overflow-hidden border-t border-vscodeBorder">
        <Sidebar callGraph={callGraph} onSelect={setSelectedEntryPoint} selectedNode={selectedEntryPoint} indexingStatus={statusMessage} />
        <div className="flex flex-1 bg-vscodeBg">
          <CodeChartArea selectedEntryPoint={selectedEntryPoint} callGraph={callGraph} screenWidthFraction={1} />
        </div>
      </div>
    </div>
  );
};

export default App;