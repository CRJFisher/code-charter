import * as vscode from "vscode";
import { addToGitignore } from "./files";
import { summarise_call_graph } from "./summarise/summarise";
import { navigateToDoc } from "./navigate";
import { ModelDetails, ModelProvider } from "./model";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { get_cluster_descriptions } from "./summarise/summariseClusters";
import type { CallGraph } from "@ariadnejs/types";
import type { TreeAndContextSummaries } from "@code-charter/types";
import { getWebviewContent } from "./webview_template";
import { UIDevWatcher } from "./dev_watcher";
import { ClusteringService, read_clustering_config } from "./clustering/clustering_service";
import { SomClusteringService } from "./clustering/som_clustering_service";
import { AriadneProjectManager } from "./ariadne/project_manager";
import type { NodeGroup } from "@code-charter/types";

const extensionFolder = ".code-charter";

let webviewColumn: vscode.ViewColumn | undefined;

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand("code-charter-vscode.generateDiagram", () =>
    generateDiagram(context)
  );

  const configureEmbeddingsCommand = vscode.commands.registerCommand(
    "code-charter-vscode.configureClusterEmbeddings",
    async () => {
      const { EmbeddingProviderSelector } = await import("./clustering/embedding_provider_selector");
      await EmbeddingProviderSelector.configure_embeddings();
    }
  );

  context.subscriptions.push(disposable, configureEmbeddingsCommand);
}

async function generateDiagram(context: vscode.ExtensionContext) {
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
  let somClusteringService: SomClusteringService | undefined;

  panel.webview.onDidReceiveMessage(
    async (message) => {
      const { command, id, ...otherFields } = message;

      const commandHandlers: { [key: string]: () => Promise<void> } = {
        getCallGraph: async () => {
          const workspacePath = workspaceFolders[0].uri.fsPath;

          if (!projectManager) {
            projectManager = new AriadneProjectManager(workspacePath, (path) => {
              return (
                !path.includes("test") &&
                !path.includes("node_modules") &&
                !path.includes("__pycache__") &&
                !path.includes(".git")
              );
            });

            projectManager.onCallGraphChanged(async (newCallGraph) => {
              callGraph = newCallGraph;
              panel.webview.postMessage({
                command: "callGraphUpdated",
                data: newCallGraph
              });

              // Trigger incremental re-clustering if SOM service is active
              if (somClusteringService?.is_som_ready()) {
                try {
                  const summaries_entry = Object.values(topLevelFunctionToSummaries)[0];
                  if (summaries_entry) {
                    // Convert CallGraph nodes to Record for the SOM service.
                    // Use the new call graph's nodes but filter to known symbols.
                    const new_call_graph_items: Record<string, any> = {};
                    if (newCallGraph && typeof newCallGraph === "object" && "nodes" in newCallGraph) {
                      const nodes_map = (newCallGraph as any).nodes;
                      if (nodes_map && typeof nodes_map.forEach === "function") {
                        nodes_map.forEach((node: any, key: string) => {
                          new_call_graph_items[key] = node;
                        });
                      }
                    }

                    // Use new call graph items if available, else fall back to last known
                    const call_graph_items = Object.keys(new_call_graph_items).length > 0
                      ? new_call_graph_items
                      : summaries_entry.callTreeWithFilteredOutNodes;

                    const updated_groups = await somClusteringService.incremental_recluster(
                      call_graph_items,
                      summaries_entry.refinedFunctionSummaries
                    );

                    if (updated_groups) {
                      panel.webview.postMessage({
                        command: "clusteringUpdated",
                        data: updated_groups,
                      });
                    }
                  }
                } catch (error) {
                  console.error("Incremental re-clustering failed:", error);
                }
              }
            });

            callGraph = await projectManager.initialize();
          } else {
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
          const summaries = await summarise_call_graph(
            topLevelFunctionSymbol,
            callGraph,
            workFolder,
            workspacePath,
            modelDetails
          );
          topLevelFunctionToSummaries[topLevelFunctionSymbol] = summaries;
          panel.webview.postMessage({ id, command: "summariseCodeTreeResponse", data: summaries });
        },
        clusterCodeTree: async () => {
          const { topLevelFunctionSymbol } = otherFields;
          if (!callGraph) {
            throw new Error("Call graph not available");
          }
          const modelDetails = await getModelDetails();
          const summaries = topLevelFunctionToSummaries[topLevelFunctionSymbol];
          if (!summaries) {
            throw new Error("Summaries not yet generated for this symbol");
          }

          const configuration = vscode.workspace.getConfiguration("code-charter-vscode");
          const apiKey = configuration.get<string>("APIKey") || null;
          const clustering_config = read_clustering_config();

          let node_groups: NodeGroup[];

          if (clustering_config.algorithm === "som") {
            // Use SOM clustering service for incremental support
            if (!somClusteringService) {
              somClusteringService = new SomClusteringService(apiKey, workFolder, context);
            }

            const som_groups = await somClusteringService.full_cluster(
              summaries.refinedFunctionSummaries,
              summaries.callTreeWithFilteredOutNodes
            );

            // Get descriptions for SOM clusters
            const descriptions = await get_cluster_descriptions(
              som_groups.map((group) =>
                group.memberSymbols.map((memberSymbol) => ({
                  symbol: memberSymbol,
                  function_summary_string: summaries.refinedFunctionSummaries[memberSymbol],
                }))
              ),
              modelDetails,
              summaries.contextSummary,
              callGraph
            );

            node_groups = som_groups.map((group, i) => ({
              description: descriptions[i],
              memberSymbols: group.memberSymbols,
              metadata: {
                algorithm_used: "som" as const,
                cluster_index: i,
                quality_score: group.metadata?.quality_score,
              },
            }));
          } else {
            // Use standard clustering service
            const clusteringService = new ClusteringService(
              apiKey,
              workFolder,
              context,
              clustering_config
            );

            const cluster_result = await clusteringService.cluster(
              summaries.refinedFunctionSummaries,
              summaries.callTreeWithFilteredOutNodes
            );

            const descriptions = await get_cluster_descriptions(
              cluster_result.clusters.map((cluster) =>
                cluster.map((memberSymbol) => ({
                  symbol: memberSymbol,
                  function_summary_string: summaries.refinedFunctionSummaries[memberSymbol],
                }))
              ),
              modelDetails,
              summaries.contextSummary,
              callGraph
            );

            node_groups = cluster_result.clusters.map((cluster, i) => ({
              description: descriptions[i],
              memberSymbols: cluster,
              metadata: {
                algorithm_used: cluster_result.algorithm_used,
                cluster_index: i,
                quality_score: cluster_result.quality_score,
              },
            }));
          }

          panel.webview.postMessage({ id, command: "clusterCodeTreeResponse", data: node_groups });
        },
        functionSummaryStatus: async () => {
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

  panel.onDidDispose(() => {
    projectManager?.dispose();
    projectManager = undefined;
    somClusteringService?.dispose();
    somClusteringService = undefined;
  }, null, context.subscriptions);

  if (isDevelopment) {
    const devWatcher = new UIDevWatcher(context, () => {
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
    const modelName = "mistral";
    return {
      uid: `ollama:${modelName}`,
      provider: ModelProvider.Ollama,
      model: new ChatOllama({
        baseUrl: "http://localhost:11434",
        model: modelName,
        format: "txt",
        keepAlive: "20m",
      }),
    };
  } else {
    throw new Error(`Unsupported model provider: ${provider}`);
  }
  throw new Error(`Unsupported model provider: ${provider}`);
}


export function deactivate() {}
