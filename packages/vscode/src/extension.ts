import * as vscode from "vscode";
import { add_to_gitignore } from "./files";
import { navigate_to_doc } from "./navigate";
import type { CallGraph, CallableNode, SymbolId } from "@ariadnejs/types";
import { serialize_call_graph, get_docstring, type DocstringSummaries } from "@code-charter/types";
import { get_webview_content } from "./webview_template";
import { UIDevWatcher } from "./dev_watcher";
import { ClusteringService } from "./clustering/clustering_service";
import { VscodeCacheStorage } from "./clustering/vscode_cache_storage";
import { LocalEmbeddingsProvider } from "./clustering/local_embeddings_provider";
import { AriadneProjectManager } from "./ariadne/project_manager";
import { ClusterSummariesStore } from "./storage/json_store";
import { symbol_repo_local_name } from "../shared/symbols";

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
    add_to_gitignore(extension_folder);
  }

  await show_webview_diagram(workspace_folders, context, work_dir);
}

async function show_webview_diagram(
  workspace_folders: readonly vscode.WorkspaceFolder[],
  context: vscode.ExtensionContext,
  work_folder: vscode.Uri
) {
  const is_development = process.env.CODE_CHARTER_DEV_MODE === "true"
    || vscode.workspace.getConfiguration("code-charter-vscode").get("devMode", false);

  const panel = vscode.window.createWebviewPanel("codeDiagram", "Code Charter Diagram", vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [
      vscode.Uri.file(context.extensionPath),
      vscode.Uri.joinPath(context.extensionUri, "..", "ui", "dist"),
    ],
    ...(is_development ? {
      enableCommandUris: true,
      enableFindWidget: true
    } : {})
  });
  webview_column = panel.viewColumn;

  panel.onDidChangeViewState(() => {
    webview_column = panel.viewColumn;
  });

  const color_customizations = vscode.workspace.getConfiguration().get<Record<string, string>>("workbench.colorCustomizations") || {};

  const html_content = get_webview_content(
    panel.webview,
    context.extensionUri,
    color_customizations,
  );

  let call_graph: CallGraph | undefined;
  const top_level_function_to_descriptions: { [key: string]: DocstringSummaries } = {};
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
        get_call_graph: async () => {
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

            project_manager.on_call_graph_changed((new_call_graph) => {
              call_graph = new_call_graph;
              panel.webview.postMessage({
                command: "call_graph_updated",
                data: serialize_call_graph(new_call_graph)
              });
            });

            call_graph = await project_manager.initialize();
          } else {
            call_graph = project_manager.get_call_graph();
          }

          if (!call_graph) {
            throw new Error("Call graph not found");
          }
          panel.webview.postMessage({ id, command: "get_call_graph_response", data: serialize_call_graph(call_graph) });
        },
        get_code_tree_descriptions: async () => {
          const { top_level_function_symbol } = other_fields;
          if (!call_graph) {
            throw new Error("Call graph not found");
          }

          const descriptions = extract_descriptions(call_graph, top_level_function_symbol);
          top_level_function_to_descriptions[top_level_function_symbol] = descriptions;
          panel.webview.postMessage({ id, command: "get_code_tree_descriptions_response", data: descriptions });
        },
        cluster_code_tree: async () => {
          const { top_level_function_symbol } = other_fields;
          const descriptions = top_level_function_to_descriptions[top_level_function_symbol];
          if (!descriptions) {
            throw new Error("Descriptions not available. Call get_code_tree_descriptions first.");
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
              member_symbols: cluster,
            };
          });

          panel.webview.postMessage({ id, command: "cluster_code_tree_response", data: node_groups });
        },
        navigate_to_doc: async () => {
          const { file_path, line_number } = other_fields;
          const file_uri = vscode.Uri.file(file_path);
          await navigate_to_doc(file_uri, line_number, webview_column);
          panel.webview.postMessage({ id, command: "navigate_to_doc_response", data: { success: true } });
        },
      };

      const handler = command_handlers[command];
      try {
        if (!handler) {
          throw new Error(`Unsupported command: ${command}`);
        }
        await handler();
      } catch (err) {
        const error_message = err instanceof Error ? err.message : String(err);
        const error_stack = err instanceof Error ? err.stack : undefined;
        console.error(`[code-charter] command "${command}" failed:`, err);
        panel.webview.postMessage({
          id,
          command: `${command}_response`,
          error: { message: error_message, stack: error_stack },
        });
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
      panel.webview.html = get_webview_content(
        panel.webview,
        context.extensionUri,
        color_customizations,
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

    const node = call_graph.nodes.get(symbol as SymbolId);
    if (!node) return;

    call_tree[symbol] = node;

    const docstring = get_docstring(node.definition);
    docstrings[symbol] = docstring || symbol_repo_local_name(symbol);

    for (const call_ref of node.enclosed_calls) {
      for (const resolution of call_ref.resolutions) {
        walk(resolution.symbol_id);
      }
    }
  }

  walk(top_level_symbol);

  return { docstrings, call_tree };
}

export function deactivate(): void {
  return;
}
