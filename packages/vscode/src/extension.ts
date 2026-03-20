import * as vscode from "vscode";
import { addToGitignore } from "./files";
import { navigateToDoc } from "./navigate";
import { CallGraph } from "@ariadnejs/core";
import { DocstringSummaries } from "@shared/codeGraph";
import { getWebviewContent } from "./webview_template";
import { UIDevWatcher } from "./dev_watcher";
import { ClusteringService } from "./clustering/clustering_service";
import { VscodeCacheStorage } from "./clustering/vscode_cache_storage";
import { LocalEmbeddingsProvider } from "./clustering/local_embeddings_provider";
import { AriadneProjectManager } from "./ariadne/project_manager";
import { RegexDocstringProvider } from "./docstrings";
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
  const docstring_provider = new RegexDocstringProvider();

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

          const descriptions = extract_descriptions(call_graph, topLevelFunctionSymbol, docstring_provider, workspace_folders[0].uri.fsPath);
          top_level_function_to_descriptions[topLevelFunctionSymbol] = descriptions;
          panel.webview.postMessage({ id, command: "getCodeTreeDescriptionsResponse", data: descriptions });
        },
        clusterCodeTree: async () => {
          const { topLevelFunctionSymbol } = other_fields;
          const descriptions = top_level_function_to_descriptions[topLevelFunctionSymbol];
          if (!descriptions) {
            throw new Error("Descriptions not available. Call getCodeTreeDescriptions first.");
          }

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
 * Walks the call tree and uses RegexDocstringProvider to get docstrings from source files.
 */
function extract_descriptions(
  call_graph: CallGraph,
  top_level_symbol: string,
  docstring_provider: RegexDocstringProvider,
  workspace_path: string
): DocstringSummaries {
  const docstrings: Record<string, string> = {};
  const call_tree: Record<string, any> = {};
  const visited = new Set<string>();
  const fs = require("fs");
  const path = require("path");

  // Cache of file -> docstrings map
  const file_docstrings_cache = new Map<string, Map<string, import("@code-charter/types").DocstringInfo>>();

  function walk(symbol: string) {
    if (visited.has(symbol)) return;
    visited.add(symbol);

    const node = call_graph.nodes.get(symbol);
    if (!node) return;

    call_tree[symbol] = node;

    // Try to get docstring from the definition
    const def = node.definition;
    if (def && def.file_path) {
      const abs_path = path.isAbsolute(def.file_path)
        ? def.file_path
        : path.join(workspace_path, def.file_path);

      if (!file_docstrings_cache.has(abs_path)) {
        try {
          const content = fs.readFileSync(abs_path, "utf-8");
          file_docstrings_cache.set(abs_path, docstring_provider.get_docstrings(abs_path, content));
        } catch {
          file_docstrings_cache.set(abs_path, new Map());
        }
      }

      const file_docs = file_docstrings_cache.get(abs_path)!;
      const local_name = symbolRepoLocalName(symbol);

      // Try to find a matching docstring by local name
      for (const [key, info] of file_docs) {
        if (key === local_name || key.endsWith(`.${local_name}`)) {
          docstrings[symbol] = info.body;
          break;
        }
      }
    }

    // Fallback: use the symbol's display name
    if (!docstrings[symbol]) {
      docstrings[symbol] = symbolRepoLocalName(symbol);
    }

    // Walk children
    for (const call of node.calls) {
      walk(call.symbol);
    }
  }

  walk(top_level_symbol);

  return { docstrings, call_tree };
}

export function deactivate() {}
