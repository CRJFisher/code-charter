import * as path from "node:path";
import * as fs from "node:fs";

import * as vscode from "vscode";
import { add_to_gitignore } from "./files";
import { navigate_to_doc } from "./navigate";
import type { CallGraph } from "@ariadnejs/types";
import { serialize_call_graph } from "@code-charter/types";
import {
  build_skeleton_flows,
  open_graph_store,
  order_flows,
  project_flow,
  read_hydrated_flows,
  skeleton_to_summary,
} from "@code-charter/core";
import { get_webview_content } from "./webview_template";
import { UIDevWatcher } from "./dev_watcher";
import { AriadneProjectManager } from "./ariadne/project_manager";

const extension_folder = ".code-charter";
/** The on-disk graph store the hydrated-flow read opens — same convention as the drift MCP server. */
const graph_db_file = "graph.db";

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

  const workspace_path = workspace_folders[0].uri.fsPath;
  let call_graph: CallGraph | undefined;
  let project_manager: AriadneProjectManager | undefined;

  // Lazily build the Ariadne call graph once, then serve it from the cached project manager. Both the
  // raw call-graph request and the flow handlers (which derive the skeleton from it) funnel through
  // here, so a re-extraction after a code change is picked up on the next request — the flow surface is
  // a per-request snapshot (live re-sync is task-27.1.6's Stop-hook hydration, not a webview push).
  const ensure_call_graph = async (): Promise<CallGraph> => {
    if (!project_manager) {
      project_manager = new AriadneProjectManager(workspace_path, (file_path) => {
        return (
          !file_path.includes("test") &&
          !file_path.includes("node_modules") &&
          !file_path.includes("__pycache__") &&
          !file_path.includes(".git")
        );
      });
      call_graph = await project_manager.initialize();
    } else {
      call_graph = project_manager.get_call_graph();
    }

    if (!call_graph) {
      throw new Error("Call graph not found");
    }
    return call_graph;
  };

  // Read persisted hydrated flows (`agentic.flow` nodes) so they sort ahead of the deterministic
  // skeleton (AC#7). The store may not exist on a cold repo that has never been hydrated (task-27.1.6
  // writes these); in that case there are simply no hydrated flows and the list is pure skeleton.
  const read_hydrated = () => {
    const db_path = path.join(work_folder.fsPath, graph_db_file);
    if (!fs.existsSync(db_path)) {
      return [];
    }
    const store = open_graph_store(db_path);
    try {
      return read_hydrated_flows(store.all_nodes());
    } finally {
      store.close();
    }
  };

  panel.webview.onDidReceiveMessage(
    async (message) => {
      const { command, id, ...other_fields } = message;

      const command_handlers: { [key: string]: () => Promise<void> } = {
        get_call_graph: async () => {
          const graph = await ensure_call_graph();
          panel.webview.postMessage({ id, command: "get_call_graph_response", data: serialize_call_graph(graph) });
        },
        list_flows: async () => {
          const graph = await ensure_call_graph();
          const skeleton = build_skeleton_flows(graph).map(skeleton_to_summary);
          const flows = order_flows(read_hydrated(), skeleton);
          panel.webview.postMessage({ id, command: "list_flows_response", data: flows });
        },
        render_flow: async () => {
          const { flow_id } = other_fields;
          const graph = await ensure_call_graph();
          const flow = build_skeleton_flows(graph).find((candidate) => candidate.id === flow_id);
          if (!flow) {
            throw new Error(`Unknown flow: ${flow_id}`);
          }
          const rows = project_flow(flow, graph);
          panel.webview.postMessage({ id, command: "render_flow_response", data: rows });
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

export function deactivate(): void {
  return;
}
