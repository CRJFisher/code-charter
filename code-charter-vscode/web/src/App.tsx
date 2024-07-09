import "reflect-metadata";
import React from 'react';
import { useEffect, useState } from 'react';
import './App.css';
import {
  VSCodeButton,
  VSCodeDataGrid,
  VSCodeDataGridRow,
  VSCodeDataGridCell,
  VSCodeTextField,
  VSCodeProgressRing,
} from "@vscode/webview-ui-toolkit/react";
import Header from './Header';
import EntryPointDetails from './EntryPointDetails';
import Sidebar from './SideBar';
import { EntryPoint } from './models';
import { CodeChartArea } from './CodeChartArea';
import { StatusBar } from './StatusBar';
import { detectEnvironments, getCallGraphForEnvironment } from './vscodeApi';
import { CallGraph, DefinitionNode, ProjectEnvironmentId } from "../../shared/models";
import { symbolDisplayName } from "shared/symbols";

enum Status {
  DetectingEnvironments = 'Detecting Environments',
  Indexing = 'Indexing',
  DetectingCallTrees = 'Detecting Call Trees',
  Summarising = 'Summarising',
  Error = 'Error',
  None = ""
}

async function detectEntryPoints(setCallGraph: React.Dispatch<React.SetStateAction<CallGraph>>, setStatusMessage: React.Dispatch<React.SetStateAction<Status>>) {
  console.log("detectEntryPoints");

  /// (1. Detect and select the environment)
  setStatusMessage(Status.DetectingEnvironments);
  
  const environments = await detectEnvironments();
  
  if (!environments || environments.length === 0) {
    setStatusMessage(Status.Error);
    return;
  }
  
  let selectedEnvironment: ProjectEnvironmentId;
  if (environments.length > 1) {
    // TODO: implement select 
    setStatusMessage(Status.Error);
    // selectedEnvironment = environments.find((env) => env.displayName() === picked);
    return;
  } else {
    selectedEnvironment = environments[0];
  
  }
  setStatusMessage(Status.Indexing);

  // const extensionFolders = await getEnvironmentFilePaths(selectedEnvironment.uris.workspaceDir, selectedEnvironment.uris.projectDir);

  // let envFileString = selectedEnvironment.fileName();
  // if (envFileString.length > 0) {
  //   envFileString += '-';
  // }

  // const versionSuffix = (await getFileVersionHash()) || 'latest';
  // const scipFileName = `index-${envFileString}${versionSuffix}.scip`;
  // const scipFilePath = `${extensionFolders.workDir}/${scipFileName}`;
  // const doesExist = await doesFileExist(scipFilePath);
  // if (doesExist) {
  //   console.log(`SCIP file already exists: ${scipFilePath}`);
  // } else {
  //   await selectedEnvironment.parseCodebaseToScipIndex(extensionFolders.workDir, scipFilePath);
  // }

  // // progress.report({ increment: 20, message: "Detecting call graphs..." });
  // const relativeWorkDirPath = selectedEnvironment.uris.asRelativePath(selectedEnvironment.uris.workDir);
  // const containerInputFilePath = scipFilePath.replace(selectedEnvironment.uris.workDir, `/sources/${relativeWorkDirPath}`);
  // console.log("containerInputFilePath", containerInputFilePath);
  // const containerOutputFilePath = `/sources/${relativeWorkDirPath}/call_graph.json`;
  // console.log("containerOutputFilePath", containerOutputFilePath);

  // await runCommand(`docker run -v ${selectedEnvironment.uris.projectDir}:/sources/ crjfisher/codecharter-detectcallgraphs --input_file ${containerInputFilePath} --output_file ${containerOutputFilePath}`);

  // // Read the call graph JSON file
  // const callGraphJsonFilePath = `${selectedEnvironment.uris.workDir}/call_graph.json`;
  // // const callGraphJsonFilePath = vscode.Uri.file('/Users/chuck/workspace/repo_analysis/aider/.code-charter/1718388735764/call_graph.json');
  // const callGraph = await readCallGraphJsonFile(callGraphJsonFilePath);

  const callGraph = await getCallGraphForEnvironment(selectedEnvironment);

  if (!callGraph) {
    setStatusMessage(Status.Error);
    return;
  }
  setCallGraph(callGraph);

  setStatusMessage(Status.None);
}

const App: React.FC = () => {
  const [callGraph, setCallGraph] = useState<CallGraph>({ topLevelNodes: [], definitionNodes: {} });
  const [selectedEntryPoint, setSelectedEntryPoint] = useState<DefinitionNode | null>(null);
  const [statusMessage, setStatusMessage] = useState<Status>(Status.Indexing);

  useEffect(() => {
    detectEntryPoints(setCallGraph, setStatusMessage);
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar callGraph={callGraph} onSelect={setSelectedEntryPoint} />
        <div className="flex flex-1">
          <CodeChartArea selectedEntryPoint={selectedEntryPoint} callGraph={callGraph} />
          <EntryPointDetails entryPoint={selectedEntryPoint} />
        </div>
      </div>
      <StatusBar statusMessage={statusMessage} />
    </div>
  );
};

export default App;

function DataView() {
  const rowData = [
    {
      cell1: "Cell Data",
      cell2: "Cell Data",
      cell3: "Cell Data",
      cell4: "Cell Data",
    },
    {
      cell1: "Cell Data",
      cell2: "Cell Data",
      cell3: "Cell Data",
      cell4: "Cell Data",
    },
    {
      cell1: "Cell Data",
      cell2: "Cell Data",
      cell3: "Cell Data",
      cell4: "Cell Data",
    },
  ];

  let [count, setCount] = useState(0);
  window.addEventListener('message', event => {

    const message = event.data; // The JSON data our extension sent

    switch (message.command) {
      case 'refactor':
        console.log('Refactor command received');
        count = Math.ceil(count * 0.5);
        break;
    }
  });

  return (
    <div className="grid gap-3 p-2 place-items-start">
      <VSCodeDataGrid>
        <VSCodeDataGridRow row-type="header">
          <VSCodeDataGridCell cell-type="columnheader" grid-column="1">
            A Custom Header Title
          </VSCodeDataGridCell>
          <VSCodeDataGridCell cell-type="columnheader" grid-column="2">
            Another Custom Title
          </VSCodeDataGridCell>
          <VSCodeDataGridCell cell-type="columnheader" grid-column="3">
            Title Is Custom {count}
          </VSCodeDataGridCell>
          <VSCodeDataGridCell cell-type="columnheader" grid-column="4">
            Custom Title
          </VSCodeDataGridCell>
        </VSCodeDataGridRow>
        {rowData.map((row) => (
          <VSCodeDataGridRow>
            <VSCodeDataGridCell grid-column="1">{row.cell1}</VSCodeDataGridCell>
            <VSCodeDataGridCell grid-column="2">{row.cell2}</VSCodeDataGridCell>
            <VSCodeDataGridCell grid-column="3">{row.cell3}</VSCodeDataGridCell>
            <VSCodeDataGridCell grid-column="4">{row.cell4}</VSCodeDataGridCell>
          </VSCodeDataGridRow>
        ))}
      </VSCodeDataGrid>

      <span className="flex gap-3">
        <VSCodeProgressRing />
        <VSCodeTextField />
        <VSCodeButton>Add</VSCodeButton>
        <VSCodeButton appearance="secondary">Remove</VSCodeButton>
      </span>
    </div>
  );
}

