import * as vscode from "vscode";
import { addToGitignore } from "./files";
import { summariseCallGraph } from "./summarise/summarise";
import { navigateToDoc } from "./navigate";
import { ModelDetails, ModelProvider } from "./model";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { getClusterDescriptions } from "./summarise/summariseClusters";
import { CallGraph } from "@ariadnejs/core";
import { TreeAndContextSummaries } from "@shared/codeGraph";
import { getWebviewContent } from "./webview_template";
import { UIDevWatcher } from "./dev_watcher";
import { ClusteringService } from "./clustering/clustering_service";
import { AriadneProjectManager } from "./ariadne/project_manager";

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
    // Enable Chrome DevTools debugging in development
    ...(process.env.CODE_CHARTER_DEV_MODE === "true" ? { 
      enableCommandUris: true,
      enableFindWidget: true 
    } : {})
  });
  webviewColumn = panel.viewColumn;

  panel.onDidChangeViewState(() => {
    webviewColumn = panel.viewColumn;
  });

  const colorCustomizations = vscode.workspace.getConfiguration().get("workbench.colorCustomizations") || {};
  const codeCharterConfig = vscode.workspace.getConfiguration("code-charter-vscode");
  const isDevelopment = process.env.CODE_CHARTER_DEV_MODE === "true" || codeCharterConfig.get("devMode", false);
  const devServerUrl = codeCharterConfig.get("devServerUrl", "http://localhost:3000");
  
  const htmlContent = getWebviewContent(
    panel.webview, 
    context.extensionUri, 
    colorCustomizations,
    isDevelopment,
    devServerUrl
  );

  let callGraph: CallGraph | undefined;
  let topLevelFunctionToSummaries: { [key: string]: TreeAndContextSummaries } = {};
  let projectManager: AriadneProjectManager | undefined;

  panel.webview.onDidReceiveMessage(
    async (message) => {
      const { command, id, ...otherFields } = message;

      // Map of command handlers
      const commandHandlers: { [key: string]: () => Promise<void> } = {
        getCallGraph: async () => {
          // Use the first workspace folder directly
          const workspacePath = workspaceFolders[0].uri.fsPath;
          
          // Initialize project manager if not already done
          if (!projectManager) {
            projectManager = new AriadneProjectManager(workspacePath, (path) => {
              // Filter out test files and common non-source directories
              return (
                !path.includes("test") &&
                !path.includes("node_modules") &&
                !path.includes("__pycache__") &&
                !path.includes(".git")
              );
            });
            
            // Set up listener for call graph changes
            projectManager.onCallGraphChanged((newCallGraph) => {
              callGraph = newCallGraph;
              // Notify the webview that the call graph has been updated
              panel.webview.postMessage({ 
                command: "callGraphUpdated", 
                data: newCallGraph 
              });
            });
            
            // Initialize and get the initial call graph
            callGraph = await projectManager.initialize();
          } else {
            // Get current call graph from project manager
            callGraph = projectManager.getCallGraph();
          }
          
          if (!callGraph) {
            throw new Error("Call graph not found");
          }
          panel.webview.postMessage({ id, command: "getCallGraphResponse", data: callGraph });
        },
        summariseCodeTree: async () => {
          const { topLevelFunctionSymbol } = otherFields;
          if (!callGraph) {
            throw new Error("Call graph not found");
          }
          const workspacePath = workspaceFolders[0].uri;
          const modelDetails = await getModelDetails();
          const summaries = await summariseCallGraph(
            topLevelFunctionSymbol,
            callGraph,
            workFolder,
            workspacePath,
            modelDetails
          );
          // TODO: create a filtered Record<string, DefinitionNode> based on filtered out nodes. Then we don't need filtering
          topLevelFunctionToSummaries[topLevelFunctionSymbol] = summaries;
          panel.webview.postMessage({ id, command: "summariseCodeTreeResponse", data: summaries });
        },
        clusterCodeTree: async () => {
          const { topLevelFunctionSymbol } = otherFields;
          const modelDetails = await getModelDetails();
          const summaries = topLevelFunctionToSummaries[topLevelFunctionSymbol];
          
          // Create clustering service with OpenAI API key
          let clusteringService: ClusteringService;
          if (modelDetails.provider === ModelProvider.OpenAI) {
            const configuration = vscode.workspace.getConfiguration("code-charter-vscode");
            const apiKey = configuration.get("APIKey");
            if (!apiKey || typeof apiKey !== "string") {
              throw new Error("OpenAI API Key not set for clustering");
            }
            clusteringService = new ClusteringService(apiKey, workFolder);
          } else {
            throw new Error("Clustering requires OpenAI provider for embeddings");
          }
          
          // Perform clustering
          const clusters = await clusteringService.cluster(
            summaries.refinedFunctionSummaries,
            summaries.callTreeWithFilteredOutNodes
          );
          
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
          console.log("Navigating to doc:", relativeDocPath, lineNumber);
          const workspacePath = workspaceFolders[0].uri.fsPath;
          const fileUri = vscode.Uri.file(`${workspacePath}/${relativeDocPath}`);
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
  
  // Clean up project manager when panel is disposed
  panel.onDidDispose(() => {
    projectManager?.dispose();
    projectManager = undefined;
  }, null, context.subscriptions);

  // Set up dev watcher if in development mode
  if (isDevelopment) {
    const devWatcher = new UIDevWatcher(context, () => {
      // Reload the webview when UI changes
      panel.webview.html = getWebviewContent(
        panel.webview,
        context.extensionUri,
        colorCustomizations,
        isDevelopment,
        devServerUrl
      );
    });
    devWatcher.start();
  }
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


export function deactivate() {}
