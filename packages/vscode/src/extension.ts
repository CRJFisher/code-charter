import * as vscode from "vscode";
import { addToGitignore } from "./files";
import { navigateToDoc } from "./navigate";
import type { CallGraph, CallableNode } from "@ariadnejs/types";
import type { DocstringSummaries } from "@code-charter/types";
import { getWebviewContent } from "./webview_template";
import { UIDevWatcher } from "./dev_watcher";
import { ClusteringService } from "./clustering/clustering_service";
import { VscodeCacheStorage } from "./clustering/vscode_cache_storage";
import { LocalEmbeddingsProvider } from "./clustering/local_embeddings_provider";
import { AriadneProjectManager } from "./ariadne/project_manager";
import { ClusterSummariesStore } from "./storage/json_store";
import { symbolRepoLocalName } from "../shared/symbols";

const extension_folder = ".code-charter";

let webview_column: vscode.ViewColumn | undefined;

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand("code-charter-vscode.generateDiagram", () =>
    generate_diagram(context)
  );

  context.subscriptions.push(disposable);
}

async function generate_diagram(context: vscode.ExtensionContext) {
  const workspace_folders = vscode.workspace.workspaceFolders;
  if (!workspace_folders) {
    vscode.window.showWarningMessage("No workspace is open.");
    return;
  }
  const workspace_path = workspace_folders[0].uri.fsPath;
  const work_dir = vscode.Uri.file(`${workspace_path}/${extension_folder}`);
  const dir_exists = await vscode.workspace.fs.stat(work_dir).then(
    () => true,
    () => false
  );
  if (!dir_exists) {
    await vscode.workspace.fs.createDirectory(work_dir);
    addToGitignore(extension_folder);
  }

  await show_webview_diagram(workspace_folders, context, work_dir);
}

async function show_webview_diagram(
  workspace_folders: readonly vscode.WorkspaceFolder[],
  context: vscode.ExtensionContext,
  work_folder: vscode.Uri
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
  webview_column = panel.viewColumn;

  panel.onDidChangeViewState(() => {
    webview_column = panel.viewColumn;
  });

  const color_customizations = vscode.workspace.getConfiguration().get("workbench.colorCustomizations") || {};
  const code_charter_config = vscode.workspace.getConfiguration("code-charter-vscode");
  const is_development = process.env.CODE_CHARTER_DEV_MODE === "true" || code_charter_config.get("devMode", false);
  const dev_server_url = code_charter_config.get("devServerUrl", "http://localhost:3000");

  const html_content = getWebviewContent(
    panel.webview,
    context.extensionUri,
    color_customizations,
    is_development,
    dev_server_url
  );

  let call_graph: CallGraph | undefined;
  let top_level_function_to_descriptions: { [key: string]: DocstringSummaries } = {};
  let project_manager: AriadneProjectManager | undefined;
  const embedding_provider = new LocalEmbeddingsProvider(
    (message: string, progress?: number) => {
      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Code Charter: Embeddings",
        cancellable: false
      }, async (progress_reporter) => {
        progress_reporter.report({ message, increment: progress });
        await new Promise(resolve => setTimeout(resolve, progress === 100 ? 1000 : 100));
      });
    }
  );
  const clustering_service = new ClusteringService({
    embedding_provider,
    cache_storage: new VscodeCacheStorage(work_folder),
    progress_reporter: (msg) => console.log(msg)
  });

  panel.webview.onDidReceiveMessage(
    async (message) => {
      const { command, id, ...other_fields } = message;

      const command_handlers: { [key: string]: () => Promise<void> } = {
        getCallGraph: async () => {
          const workspace_path = workspace_folders[0].uri.fsPath;

          if (!project_manager) {
            project_manager = new AriadneProjectManager(workspace_path, (path) => {
              return (
                !path.includes("test") &&
                !path.includes("node_modules") &&
                !path.includes("__pycache__") &&
                !path.includes(".git")
              );
            });

            project_manager.onCallGraphChanged((new_call_graph) => {
              call_graph = new_call_graph;
              panel.webview.postMessage({
                command: "callGraphUpdated",
                data: new_call_graph
              });
            });

            call_graph = await project_manager.initialize();
          } else {
            call_graph = project_manager.getCallGraph();
          }

          if (!call_graph) {
            throw new Error("Call graph not found");
          }
          panel.webview.postMessage({ id, command: "getCallGraphResponse", data: call_graph });
        },
        getCodeTreeDescriptions: async () => {
          const { topLevelFunctionSymbol } = other_fields;
          if (!call_graph) {
            throw new Error("Call graph not found");
          }

          const descriptions = extract_descriptions(call_graph, topLevelFunctionSymbol);
          top_level_function_to_descriptions[topLevelFunctionSymbol] = descriptions;
          panel.webview.postMessage({ id, command: "getCodeTreeDescriptionsResponse", data: descriptions });
        },
        clusterCodeTree: async () => {
          const { topLevelFunctionSymbol } = other_fields;
          const descriptions = top_level_function_to_descriptions[topLevelFunctionSymbol];
          if (!descriptions) {
            throw new Error("Descriptions not available. Call getCodeTreeDescriptions first.");
          }

          const clusters = await clustering_service.cluster(
            descriptions.docstrings,
            descriptions.call_tree
          );

          // Read pre-computed cluster descriptions from JSON if available
          const workspace_path = workspace_folders[0].uri.fsPath;
          const stored_summaries = ClusterSummariesStore.read(workspace_path);

          const node_groups = clusters.map((cluster, i) => {
            const stored_cluster = stored_summaries?.clusters?.find(c => {
              const stored_members = new Set(c.members);
              return cluster.every(m => stored_members.has(m)) && cluster.length === c.members.length;
            });

            return {
              description: stored_cluster?.description || `Module ${i + 1}`,
              memberSymbols: cluster,
            };
          });

          panel.webview.postMessage({ id, command: "clusterCodeTreeResponse", data: node_groups });
        },
        navigateToDoc: async () => {
          const { relativeDocPath, lineNumber } = other_fields;
          const workspace_path = workspace_folders[0].uri.fsPath;
          const file_uri = vscode.Uri.file(`${workspace_path}/${relativeDocPath}`);
          await navigateToDoc(file_uri, lineNumber, webview_column);
          panel.webview.postMessage({ id, command: "navigateToDocResponse", data: { success: true } });
        },
      };

      const handler = command_handlers[command];
      if (handler) {
        await handler();
      } else {
        throw new Error(`Unsupported command: ${command}`);
      }
    },
    undefined,
    context.subscriptions
  );

  panel.webview.html = html_content;

  panel.onDidDispose(() => {
    project_manager?.dispose();
    project_manager = undefined;
  }, null, context.subscriptions);

  if (is_development) {
    const dev_watcher = new UIDevWatcher(context, () => {
      panel.webview.html = getWebviewContent(
        panel.webview,
        context.extensionUri,
        color_customizations,
        is_development,
        dev_server_url
      );
    });
    dev_watcher.start();
  }
}

/**
 * Extracts docstring descriptions from the call graph for a given entry point.
 * Uses ariadne's definition.docstring field directly -- ariadne already extracts
 * docstrings via tree-sitter during call graph construction.
 */
function extract_descriptions(
  call_graph: CallGraph,
  top_level_symbol: string
): DocstringSummaries {
  const docstrings: Record<string, string> = {};
  const call_tree: Record<string, CallableNode> = {};
  const visited = new Set<string>();

  function walk(symbol: string) {
    if (visited.has(symbol)) return;
    visited.add(symbol);

    const node = call_graph.nodes.get(symbol);
    if (!node) return;

    call_tree[symbol] = node;

    // Use ariadne's docstring if available, fall back to display name
    docstrings[symbol] = node.definition?.docstring || symbolRepoLocalName(symbol);

    for (const call_ref of node.enclosed_calls) {
      for (const resolution of call_ref.resolutions) {
        walk(resolution.symbol_id);
      }
    }
  }

  walk(top_level_symbol);

  return { docstrings, call_tree };
}

export function deactivate() {}
