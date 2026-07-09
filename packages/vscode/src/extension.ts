import * as path from "node:path";
import * as fs from "node:fs";

import * as vscode from "vscode";
import { add_to_gitignore } from "./files";
import { navigate_to_doc } from "./navigate";
import type { CallGraph } from "@ariadnejs/types";
import { serialize_call_graph } from "@code-charter/types";
import {
  build_skeleton_flows,
  collect_persisted_flow,
  hydrated_seed_paths,
  open_graph_store,
  order_flows,
  project_flow,
  project_hydrated_flow,
  read_hydrated_flows,
  reconstruct_flow_membership,
  skeleton_to_summary,
} from "@code-charter/core";
import type { EdgeRow, FlowSummary, NodeRow, RenderedRows } from "@code-charter/types";
import { HOST_LAYOUTS, install_drift, is_stop_hook_installed, read_sync_status } from "@code-charter/drift";
import { drift_bar_state, format_sync_status, INSTALL_DRIFT_COMMAND } from "./drift_status";
import { get_webview_content } from "./webview_template";
import { UIDevWatcher } from "./dev_watcher";
import { AriadneProjectManager } from "./ariadne/project_manager";

const extension_folder = ".code-charter";
/** The on-disk graph store the hydrated-flow read opens — same convention as the drift Stop-hook chain. */
const graph_db_file = "graph.db";

let webview_column: vscode.ViewColumn | undefined;
/** The single "Code Charter" OutputChannel — every install result, sync-status, and command error lands here. */
let output_channel: vscode.OutputChannel | undefined;
/** The "drift armed / NOT installed" indicator; hidden when the open workspace is code-charter itself. */
let status_bar_item: vscode.StatusBarItem | undefined;

function log(message: string): void {
  output_channel?.appendLine(`[code-charter] ${message}`);
}

export function activate(context: vscode.ExtensionContext) {
  output_channel = vscode.window.createOutputChannel("Code Charter");
  status_bar_item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  context.subscriptions.push(
    output_channel,
    status_bar_item,
    vscode.commands.registerCommand("code-charter-vscode.generateDiagram", () => generate_diagram(context)),
    vscode.commands.registerCommand(INSTALL_DRIFT_COMMAND, install_drift_command),
  );

  // On activation (onStartupFinished) reflect the current arm state so a disarmed hook is visible before
  // the developer ever generates a diagram — the whole point is to answer "why did my sync do nothing?".
  const workspace_path = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspace_path !== undefined) {
    refresh_drift_status(workspace_path);
  }
}

/** The status-bar "click to fix": re-install the substrate, refresh the indicator, reveal the result. */
function install_drift_command(): void {
  const workspace_path = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspace_path === undefined) {
    vscode.window.showWarningMessage("No workspace is open.");
    return;
  }
  ensure_drift_installed(workspace_path);
  refresh_drift_status(workspace_path);
  output_channel?.show(true);
}

/** The drift package's own repo root, resolved from its installed/symlinked location. */
function drift_package_root(): string {
  return path.dirname(require.resolve("@code-charter/drift/package.json"));
}

/**
 * Never dogfood code-charter onto itself: when the open workspace IS the drift package's own repo (only
 * reachable from a dev checkout), install and status-bar reveal both stand down — the product analyzes
 * OTHER repos, never its own source.
 */
function is_self_repo(workspace_path: string): boolean {
  try {
    return path.resolve(workspace_path) === path.resolve(drift_package_root(), "..", "..");
  } catch {
    return false;
  }
}

/**
 * Verify the drift Stop hook in the workspace's `.claude/settings.json` and reflect it in the status bar:
 * armed, or NOT installed with a click-to-fix. Surfaces the persisted sync-status record (task-27.1.20.3)
 * into the OutputChannel so "why did my sync do nothing?" has a starting point. Self-repo hides the bar.
 */
function refresh_drift_status(workspace_path: string): void {
  if (status_bar_item === undefined) {
    return;
  }
  if (is_self_repo(workspace_path)) {
    status_bar_item.hide();
    return;
  }
  const state = drift_bar_state(is_stop_hook_installed(workspace_path, HOST_LAYOUTS.claude_code));
  status_bar_item.text = state.text;
  status_bar_item.tooltip = state.tooltip;
  status_bar_item.command = INSTALL_DRIFT_COMMAND;
  status_bar_item.backgroundColor = state.warn
    ? new vscode.ThemeColor("statusBarItem.warningBackground")
    : undefined;
  status_bar_item.show();

  const store_path = path.join(workspace_path, extension_folder, graph_db_file);
  log(format_sync_status(read_sync_status(store_path)));
}

/**
 * Install (or refresh) the drift substrate into the open workspace so Claude Code sessions there fire
 * the Stop-hook reconcile chain that keeps the diagram in sync with the code. The drift package — its
 * `assets/` bundle and built bins — ships inside the extension; `require.resolve` finds it both in the
 * dev checkout (workspace symlink) and in the packaged extension (bundled dependency). The install is
 * idempotent and must never block diagram generation, so any failure is reported and swallowed. Every
 * outcome — skip, success, failure — is written to the OutputChannel so a silent install is impossible.
 */
function ensure_drift_installed(workspace_path: string): void {
  if (is_self_repo(workspace_path)) {
    log("drift install skipped: the open workspace is code-charter itself");
    return;
  }
  try {
    install_drift(workspace_path, HOST_LAYOUTS.claude_code, drift_package_root());
    log(`drift substrate installed/refreshed into ${path.join(workspace_path, ".claude")}`);
  } catch (err) {
    log(`drift substrate install FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function generate_diagram(context: vscode.ExtensionContext) {
  const workspace_folders = vscode.workspace.workspaceFolders;
  if (!workspace_folders) {
    vscode.window.showWarningMessage("No workspace is open.");
    return;
  }
  const workspace_path = workspace_folders[0].uri.fsPath;
  ensure_drift_installed(workspace_path);
  refresh_drift_status(workspace_path);
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
      // Index the same file set the drift reconcile engine does (HeadlessProject): every supported
      // source minus EXCLUDED_DIRS, tests included. The webview renders flows from the persisted store
      // the reconcile engine writes, so the two indexers must agree on which files exist — otherwise a
      // persisted flow whose seed lives in a file the webview skipped resolves to zero members and
      // renders empty. The default filter keeps `node_modules`/`.git`/etc. out via EXCLUDED_DIRS.
      project_manager = new AriadneProjectManager(workspace_path);
      call_graph = await project_manager.initialize();
    } else {
      call_graph = project_manager.get_call_graph();
    }

    if (!call_graph) {
      throw new Error("Call graph not found");
    }
    return call_graph;
  };

  // Read the persisted store rows (the on-disk graph the Stop-hook reconcile sub-agent writes). Returns
  // null on a cold repo that has never been hydrated, in which case the surface is pure skeleton.
  // Read-only: the extension must never compete for the write lock a reconcile holds (a read-write
  // open would also run schema init — a write); snapshot() reads nodes+edges in one transaction so
  // a reconcile committing mid-read can never produce a torn pair. The existsSync guard is
  // load-bearing — a read-only open of a missing file throws rather than creating it.
  const read_store_rows = (): { nodes: NodeRow[]; edges: EdgeRow[] } | null => {
    const db_path = path.join(work_folder.fsPath, graph_db_file);
    if (!fs.existsSync(db_path)) {
      return null;
    }
    const store = open_graph_store(db_path, { read_only: true });
    try {
      return store.snapshot();
    } finally {
      store.close();
    }
  };

  // Hydrated flows (`agentic.flow` nodes) sort ahead of the deterministic skeleton (AC#7). A hydrated
  // entry that supersedes its skeleton twin inherits the twin's jump-to-source `seed_location` and live
  // `member_count`, which `read_hydrated_flows` cannot recover from the store alone.
  const read_hydrated = (skeleton: FlowSummary[], nodes: readonly NodeRow[]): FlowSummary[] => {
    const by_id = new Map(skeleton.map((flow) => [flow.id, flow]));
    return read_hydrated_flows(nodes).map((flow) => {
      const twin = by_id.get(flow.id);
      return twin === undefined
        ? flow
        : { ...flow, seed_location: twin.seed_location, member_count: twin.member_count };
    });
  };

  // Render a hydrated flow from its persisted seeds/bridges/docs (an `agentic.flow` id need not equal any
  // skeleton id). Returns null when the id is not a live persisted flow, so the caller can fall through.
  const render_hydrated_flow = (flow_id: string, graph: CallGraph): RenderedRows | null => {
    const rows = read_store_rows();
    if (rows === null) {
      return null;
    }
    const persisted = collect_persisted_flow(flow_id, rows.nodes, rows.edges);
    if (persisted === undefined) {
      return null;
    }
    const membership = reconstruct_flow_membership(persisted, graph);
    const doc_ids = new Set(membership.linked_docs ?? []);
    const doc_nodes = rows.nodes.filter((node) => doc_ids.has(node.id));
    return project_hydrated_flow(membership, graph, doc_nodes);
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
          const rows = read_store_rows();
          // A hydrated grouped flow folds several seed entrypoints under one id (its dominant seed), so
          // its non-dominant seeds must be suppressed from the skeleton or they re-surface as duplicate
          // bare entries. `claimed_paths` is every hydrated flow's full seed set, not just its id.
          const hydrated = rows === null ? [] : read_hydrated(skeleton, rows.nodes);
          const claimed_paths = rows === null ? new Set<string>() : hydrated_seed_paths(rows.nodes);
          const flows = order_flows(hydrated, skeleton, claimed_paths);
          panel.webview.postMessage({ id, command: "list_flows_response", data: flows });
        },
        render_flow: async () => {
          const { flow_id } = other_fields;
          const graph = await ensure_call_graph();
          const skeleton = build_skeleton_flows(graph).find((candidate) => candidate.id === flow_id);
          // A skeleton id renders deterministically; any other id is a hydrated flow read from the store.
          const rows = skeleton ? project_flow(skeleton, graph) : render_hydrated_flow(flow_id, graph);
          if (!rows) {
            throw new Error(`Unknown flow: ${flow_id}`);
          }
          panel.webview.postMessage({ id, command: "render_flow_response", data: rows });
        },
        navigate_to_doc: async () => {
          const { file_path, line_number } = other_fields;
          // Flow seed_locations are repo-relative (the call graph is keyed on repo-relative paths); resolve
          // to absolute for the editor. An already-absolute path passes through unchanged.
          const absolute = path.isAbsolute(file_path) ? file_path : path.join(workspace_path, file_path);
          const file_uri = vscode.Uri.file(absolute);
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
        log(`command "${command}" failed: ${error_stack ?? error_message}`);
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
