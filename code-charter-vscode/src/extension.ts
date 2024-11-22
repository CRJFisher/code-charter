import * as vscode from "vscode";
import { addToGitignore } from "./files";
import { checkDockerInstalled } from "./docker";
import { runCommand } from "./run";
import { getFileVersionHash } from "./git";
import { detectEnvironment, ProjectEnvironment } from "./project/projectTypeDetection";
import { readCallGraphJsonFile, summariseCallGraph } from "./summarise/summarise";
import { CallGraph, TreeAndContextSummaries } from "../shared/codeGraph";
import { ProjectEnvironmentId } from "../shared/codeGraph";
import { navigateToDoc } from "./navigate";
import { ModelDetails, ModelProvider } from "./model";
import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { getClusterDescriptions } from "./summarise/summariseClusters";

const extensionFolder = ".code-charter";

let webviewColumn: vscode.ViewColumn | undefined;

export function activate(context: vscode.ExtensionContext) {
  // The command has been defined in the package.json file
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand("code-charter-vscode.generateDiagram", () =>
    generateDiagram(context)
  );

  context.subscriptions.push(disposable);
}

async function generateDiagram(context: vscode.ExtensionContext) {
  // Check docker is installed
  const isDockerInstalled = await checkDockerInstalled();
  if (!isDockerInstalled) {
    vscode.window.showErrorMessage("Docker is not running. Please install and run Docker to use this extension.");
    return;
  }
  // Check if a `.code-charter` directory exists in the workspace
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showWarningMessage("No workspace is open.");
    return;
  }
  const workspacePath = workspaceFolders[0].uri.fsPath;
  const workDir = vscode.Uri.file(`${workspacePath}/${extensionFolder}`);
  const dirExists = await vscode.workspace.fs.stat(workDir).then(
    () => true,
    () => false
  );
  if (!dirExists) {
    // Create the directory
    await vscode.workspace.fs.createDirectory(workDir);
    addToGitignore(extensionFolder);
  }

  await showWebviewDiagram(workspaceFolders, context, workDir);
}

async function showWebviewDiagram(
  workspaceFolders: readonly vscode.WorkspaceFolder[],
  context: vscode.ExtensionContext,
  workFolder: vscode.Uri
) {
  const panel = vscode.window.createWebviewPanel("codeDiagram", "Code Charter Diagram", vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [
      vscode.Uri.file(context.extensionPath),
      vscode.Uri.joinPath(context.extensionUri, "node_modules"),
    ],
  });
  webviewColumn = panel.viewColumn;

  panel.onDidChangeViewState(() => {
    webviewColumn = panel.viewColumn;
  });

  const scriptSrc = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "web", "dist", "bundle.js"));

  const colorCustomizations = vscode.workspace.getConfiguration().get("workbench.colorCustomizations") || {};

  const editorColors = `
  --vscode-editor-background: ${colorCustomizations["editor.background"] || "#1e1e1e"};
  --vscode-editor-foreground: ${colorCustomizations["editor.foreground"] || "#d4d4d4"};
  --vscode-editor-selectionBackground: ${colorCustomizations["editor.selectionBackground"] || "#264f78"};
  --vscode-editor-selectionForeground: ${colorCustomizations["editor.selectionForeground"] || "#ffffff"};
  --vscode-editor-lineHighlightBackground: ${colorCustomizations["editor.lineHighlightBackground"] || "#2b2b2b"};
  --vscode-editor-inactiveSelectionBackground: ${
    colorCustomizations["editor.inactiveSelectionBackground"] || "#3a3d41"
  };
  --vscode-editor-widget-border: ${colorCustomizations["editorWidget.border"] || "#454545"};
  --vscode-editorLineNumber-foreground: ${colorCustomizations["editorLineNumber.foreground"] || "#858585"};
  --vscode-editorLineNumber-activeForeground: ${colorCustomizations["editorLineNumber.activeForeground"] || "#c6c6c6"};
  --vscode-gutter-background: ${colorCustomizations["gutter.background"] || "#252526"};
  --vscode-gutter-border: ${colorCustomizations["gutter.border"] || "#454545"};
  --vscode-editor-rulerForeground: ${colorCustomizations["editorRuler.foreground"] || "#5a5a5a"};
  --vscode-editorCursor-foreground: ${colorCustomizations["editorCursor.foreground"] || "#aeafad"};
  --vscode-editorWhitespace-foreground: ${colorCustomizations["editorWhitespace.foreground"] || "#3b3a32"};
  --vscode-editorComments-foreground: ${colorCustomizations["editorComments.foreground"] || "#6a9955"};
  --vscode-editor-selectionHighlightBackground: ${
    colorCustomizations["editor.selectionHighlightBackground"] || "#add6ff26"
  };
  --vscode-editorHoverHighlight-background: ${colorCustomizations["editorHoverHighlight.background"] || "#264f78"};
  --vscode-editor-findMatchHighlightBackground: ${
    colorCustomizations["editor.findMatchHighlightBackground"] || "#ffd33d44"
  };
  --vscode-editor-findMatchBackground: ${colorCustomizations["editor.findMatchBackground"] || "#ffd33d22"};
  --vscode-editorBracketMatch-background: ${colorCustomizations["editorBracketMatch.background"] || "#a0a0a0"};
  --vscode-editorBracketMatch-border: ${colorCustomizations["editorBracketMatch.border"] || "#555555"};
  --vscode-editorOverviewRuler-border: ${colorCustomizations["editorOverviewRuler.border"] || "#282828"};
  --vscode-editorOverviewRuler-background: ${colorCustomizations["editorOverviewRuler.background"] || "#1e1e1e"};
  --vscode-editor-keyword-foreground: ${colorCustomizations["editor.keyword.foreground"] || "#569cd6"};
  --vscode-editor-function-foreground: ${colorCustomizations["editor.function.foreground"] || "#dcdcaa"};
  --vscode-editor-variable-foreground: ${colorCustomizations["editor.variable.foreground"] || "#9cdcfe"};
  --vscode-editor-string-foreground: ${colorCustomizations["editor.string.foreground"] || "#ce9178"};
  --vscode-editor-number-foreground: ${colorCustomizations["editor.number.foreground"] || "#b5cea8"};
  --vscode-editor-boolean-foreground: ${colorCustomizations["editor.boolean.foreground"] || "#569cd6"};
  --vscode-editor-constant-foreground: ${colorCustomizations["editor.constant.foreground"] || "#4ec9b0"};
  --vscode-editor-type-foreground: ${colorCustomizations["editor.type.foreground"] || "#4ec9b0"};
  --vscode-editor-operator-foreground: ${colorCustomizations["editor.operator.foreground"] || "#d4d4d4"};
  --vscode-editor-comment-foreground: ${colorCustomizations["editor.comment.foreground"] || "#6a9955"};
`;
  const htmlContent = `<!DOCTYPE html>
        <html lang="en">
          <head>
		  <style>
			:root {
			${editorColors}
			}
		</style>
          </head>
          <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root"></div>
            <script src="${scriptSrc}"></script>
          </body>
        </html>
        `;

  let callGraph: CallGraph | undefined;
  let allEnvironments: { [key: string]: ProjectEnvironment } | undefined;
  let selectedEnvironment: ProjectEnvironment | undefined;
  let topLevelFunctionToSummaries: { [key: string]: TreeAndContextSummaries } = {};

  panel.webview.onDidReceiveMessage(
    async (message) => {
      const { command, id, ...otherFields } = message;

      // Map of command handlers
      const commandHandlers: { [key: string]: () => Promise<void> } = {
        detectEnvironments: async () => {
          const envs = await detectEnvironment(workspaceFolders);
          allEnvironments = Object.fromEntries(envs?.map((env) => [env.projectPath.fsPath, env]) || []);
          const allEnvIds: ProjectEnvironmentId[] =
            envs?.map((env) => ({
              id: env.projectPath.fsPath,
              name: env.displayName(),
            })) || [];
          panel.webview.postMessage({ id, command: "detectEnvironmentsResponse", data: allEnvIds });
        },
        getCallGraphForEnvironment: async () => {
          const { env }: { env: ProjectEnvironmentId } = otherFields;
          selectedEnvironment = allEnvironments?.[env.id];
          if (!selectedEnvironment) {
            throw new Error("Selected environment not found");
          }
          const indexPath = await indexEnvironment(selectedEnvironment, workFolder);
          callGraph = await detectTopLevelFunctions(indexPath, selectedEnvironment, workFolder);
          if (!callGraph) {
            throw new Error("Call graph not found");
          }
          const topLevelFunctionsSet = new Set(selectedEnvironment.filterTopLevelFunctions(callGraph.topLevelNodes));
          callGraph.topLevelNodes = callGraph.topLevelNodes.filter((node) => topLevelFunctionsSet.has(node));
          panel.webview.postMessage({ id, command: "getCallGraphForEnvironmentResponse", data: callGraph });
        },
        summariseCodeTree: async () => {
          const { topLevelFunctionSymbol } = otherFields;
          if (!callGraph) {
            throw new Error("Call graph not found");
          }
          if (!selectedEnvironment) {
            throw new Error("Selected environment not found");
          }
          const modelDetails = await getModelDetails();
          const summaries = await summariseCallGraph(
            topLevelFunctionSymbol,
            callGraph,
            workFolder,
            selectedEnvironment.projectPath,
            modelDetails
          );
          // TODO: create a filtered Record<string, DefinitionNode> based on filtered out nodes. Then we don't need filtering
          topLevelFunctionToSummaries[topLevelFunctionSymbol] = summaries;
          panel.webview.postMessage({ id, command: "summariseCodeTreeResponse", data: summaries });
        },
        clusterCodeTree: async () => {
          const { topLevelFunctionSymbol } = otherFields;
          const clusters = await clusterCodeTree(topLevelFunctionToSummaries[topLevelFunctionSymbol]);
          const modelDetails = await getModelDetails();
          const summaries = topLevelFunctionToSummaries[topLevelFunctionSymbol];
          const descriptions = await getClusterDescriptions(
            clusters.map((cluster) =>
              cluster.map((memberSymbol) => {
                return {
                  symbol: memberSymbol,
                  functionSummaryString: summaries.refinedFunctionSummaries[memberSymbol],
                };
              })
            ),
            modelDetails,
            summaries.contextSummary,
            callGraph
          );
          const nodeGroups = clusters.map((cluster, i) => {
            return {
              description: descriptions[i],
              memberSymbols: cluster,
            };
          });
          panel.webview.postMessage({ id, command: "clusterCodeTreeResponse", data: nodeGroups });
        },
        functionSummaryStatus: async () => {
          const { functionSymbol } = otherFields;
          // TODO: get it from the db
          panel.webview.postMessage({ id, command: "functionSummaryStatusResponse", data: {} });
        },
        navigateToDoc: async () => {
          const { relativeDocPath, lineNumber } = otherFields;
          const fileUri = vscode.Uri.file(`${selectedEnvironment?.projectPath.fsPath}/${relativeDocPath}`);
          await navigateToDoc(fileUri, lineNumber, webviewColumn);
          panel.webview.postMessage({ id, command: "navigateToDocResponse", data: { success: true } });
        },
      };

      // Execute the appropriate handler
      const handler = commandHandlers[command];
      if (handler) {
        await handler();
      } else {
        throw new Error(`Unsupported command: ${command}`);
      }
    },
    undefined,
    context.subscriptions
  );

  panel.webview.html = htmlContent;
}

async function getModelDetails(): Promise<ModelDetails> {
  const configuration = vscode.workspace.getConfiguration("code-charter-vscode");
  const provider = configuration.get("modelProvider");
  if (provider === ModelProvider.OpenAI) {
    const apiKey = configuration.get("APIKey");
    if (apiKey === undefined || typeof apiKey !== "string") {
      throw new Error("OpenAI API Key not set");
    }
    const modelName = "gpt-4o";
    return {
      uid: `openai:${modelName}`,
      provider: ModelProvider.OpenAI,
      model: new ChatOpenAI({
        temperature: 0,
        modelName: modelName,
        apiKey: apiKey,
        topP: 0.1,
      }),
    };
  } else if (provider === ModelProvider.Ollama) {
    // TODO: get by calling Ollama API - use the last-used model
    const modelName = "mistral"; // 'magicoder'; //"phi3:3.8b",
    return {
      uid: `ollama:${modelName}`,
      provider: ModelProvider.Ollama,
      model: new ChatOllama({
        baseUrl: "http://localhost:11434",
        model: modelName,
        format: "txt",
        keepAlive: "20m", // TODO: this doesn't work - still getting timeouts
      }),
    };
  }
}

async function indexEnvironment(selectedEnvironment: ProjectEnvironment, workDirPath: vscode.Uri): Promise<vscode.Uri> {
  let envFileString = selectedEnvironment.fileName();
  if (envFileString.length > 0) {
    envFileString += "-";
  }
  // TODO: only check for changes in the selected environment - need to add a getFiles() to environment then check against working tree changes - limit to just e.g. python files
  const versionSuffix = (await getFileVersionHash()) || "latest";
  const scipFileName = `index-${envFileString}${versionSuffix}.scip`;
  const scipFilePath = vscode.Uri.joinPath(workDirPath, scipFileName);
  const doesFileExist = await vscode.workspace.fs.stat(scipFilePath).then(
    () => true,
    () => false
  );
  if (doesFileExist) {
    console.log(`SCIP file already exists: ${scipFilePath.fsPath}`);
  } else {
    await selectedEnvironment.parseCodebaseToScipIndex(workDirPath, scipFilePath);
  }
  return scipFilePath;
}

async function detectTopLevelFunctions(
  scipFilePath: vscode.Uri,
  selectedEnvironment: ProjectEnvironment,
  workDirPath: vscode.Uri
): Promise<CallGraph> {
  const relativeWorkDirPath = vscode.workspace.asRelativePath(workDirPath);
  const containerInputFilePath = scipFilePath.fsPath.replace(workDirPath.fsPath, `/sources/${relativeWorkDirPath}`);
  console.log("containerInputFilePath", containerInputFilePath);
  const containerOutputFilePath = `/sources/${relativeWorkDirPath}/call_graph.json`;
  console.log("containerOutputFilePath", containerOutputFilePath);

  await runCommand(
    `docker run -v ${selectedEnvironment.projectPath.fsPath}:/sources/ crjfisher/codecharter-detectcallgraphs --input_file ${containerInputFilePath} --output_file ${containerOutputFilePath}`
  );

  // Read the call graph JSON file
  const callGraphJsonFilePath = vscode.Uri.file(`${workDirPath.fsPath}/call_graph.json`);
  const callGraph = await readCallGraphJsonFile(callGraphJsonFilePath);
  return callGraph;
}

async function clusterCodeTree(summaries: TreeAndContextSummaries): Promise<string[][]> {
  const response = await fetch("http://127.0.0.1:5000/cluster", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refinedFunctionSummaries: summaries.refinedFunctionSummaries,
      callGraphItems: summaries.callTreeWithFilteredOutNodes,
    }),
  });
  const clusters = await response.json();
  return clusters;
}

export function deactivate() {}
