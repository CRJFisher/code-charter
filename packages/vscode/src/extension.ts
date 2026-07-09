import * as path from "node:path";
import * as fs from "node:fs";
import { spawnSync } from "node:child_process";

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
import type { FlowOutcome } from "@code-charter/drift";
import {
  collect_store_summary,
  HOST_LAYOUTS,
  install_drift,
  is_stop_hook_installed,
  read_inspect_input,
  read_sync_status,
  render_summary,
} from "@code-charter/drift";
import {
  DEV_MODE_CONTEXT_KEY,
  drift_bar_state,
  DUMP_DRIFT_STORE_COMMAND,
  format_preview_outcomes,
  format_sync_status,
  INSTALL_DRIFT_COMMAND,
  PREVIEW_DRIFT_COMMAND,
} from "./drift_status";
import { get_webview_content } from "./webview_template";
import { UIDevWatcher } from "./dev_watcher";
import { StoreWatcher } from "./store_watcher";
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
    vscode.commands.registerCommand(PREVIEW_DRIFT_COMMAND, preview_drift_reconcile_command),
    vscode.commands.registerCommand(DUMP_DRIFT_STORE_COMMAND, dump_drift_store_command),
  );

  // Gate the dev-only preview command in the palette on the same dev-mode signal the webview reads, and
  // keep it live when the setting is toggled mid-session (else the palette entry lags until a reload).
  const sync_dev_mode_context = (): void => {
    vscode.commands.executeCommand("setContext", DEV_MODE_CONTEXT_KEY, is_dev_mode());
  };
  sync_dev_mode_context();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("code-charter-vscode.devMode")) sync_dev_mode_context();
    }),
  );

  // On activation (onStartupFinished) reflect the current arm state so a disarmed hook is visible before
  // the developer ever generates a diagram — the whole point is to answer "why did my sync do nothing?".
  const workspace_path = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspace_path !== undefined) {
    refresh_drift_status(workspace_path);
  }
}

/** Dev mode: the env flag (integration harness) or the workspace setting. Gates the reconcile preview. */
function is_dev_mode(): boolean {
  return (
    process.env.CODE_CHARTER_DEV_MODE === "true" ||
    vscode.workspace.getConfiguration("code-charter-vscode").get("devMode", false)
  );
}

/** The on-disk drift store beside the workspace — the same path the Stop-hook reconcile writes and reads. */
function store_path_for(workspace_path: string): string {
  return path.join(workspace_path, extension_folder, graph_db_file);
}

/**
 * Render the persisted drift store's summary (flow/description/bridge counts, sync health) into the
 * OutputChannel. Reads the store in-process and read-only via the same inspect projection the
 * `drift-inspect` bin uses, so a cold repo with no store yet renders an empty summary rather than
 * throwing. Shared by the dev-mode generate instrumentation (AC#1) and Dump Drift Store (AC#3).
 */
function log_store_summary(store_path: string): void {
  try {
    log("drift store summary:");
    for (const line of render_summary(collect_store_summary(read_inspect_input(store_path)))) {
      log(line);
    }
  } catch (err) {
    log(`drift store summary failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * The dev-mode "Preview Drift Reconcile" command: run the deterministic reconcile in dry-run over the
 * workspace's current diff and print the would-be outcomes to the OutputChannel — no store mutation, no
 * Claude session, no token spend. The heavy orchestration (headless index, dry-run store wrap) lives in
 * the `drift-reconcile` bin, so this shells into it exactly as the drift-sync skill does.
 */
function preview_drift_reconcile_command(): void {
  const workspace_path = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspace_path === undefined) {
    vscode.window.showWarningMessage("No workspace is open.");
    return;
  }
  if (!is_dev_mode()) {
    vscode.window.showInformationMessage(
      "Preview Drift Reconcile is a dev-mode command — enable the code-charter-vscode.devMode setting.",
    );
    return;
  }
  output_channel?.show(true);

  const changed = changed_files(workspace_path);
  if (changed.length === 0) {
    log("drift preview: no changed files vs HEAD — nothing to reconcile.");
    return;
  }

  const store_path = store_path_for(workspace_path);
  const bin = path.join(drift_package_root(), "dist", "bin", "drift_reconcile.js");
  const result = spawnSync(
    "node",
    [bin, "--dry-run", "--json", "--store", store_path, "--repo-root", workspace_path, "--files", changed.join(",")],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    // A launch failure (e.g. `node` not on the Extension Host PATH) sets result.error with status null
    // and no stderr — surface it so the channel isn't a bare "exit null: no stderr".
    const detail = result.stderr?.trim() || result.error?.message || "no diagnostics";
    log(`drift preview FAILED (exit ${result.status ?? "null"}): ${detail}`);
    return;
  }
  let outcomes: FlowOutcome[];
  try {
    outcomes = JSON.parse(result.stdout) as FlowOutcome[];
  } catch (err) {
    log(`drift preview: could not parse reconcile output: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  log(`drift preview over ${changed.length} changed file(s):`);
  log(format_preview_outcomes(outcomes));
}

/**
 * The dev-mode "Dump Drift Store" command: reveal the channel and render the persisted store's summary
 * on demand — the same instrumentation generate prints in dev mode, reachable without a re-generate so a
 * developer can inspect the store after an out-of-process reconcile lands. Read-only, no token spend.
 */
function dump_drift_store_command(): void {
  const workspace_path = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspace_path === undefined) {
    vscode.window.showWarningMessage("No workspace is open.");
    return;
  }
  if (!is_dev_mode()) {
    vscode.window.showInformationMessage(
      "Dump Drift Store is a dev-mode command — enable the code-charter-vscode.devMode setting.",
    );
    return;
  }
  output_channel?.show(true);
  log_store_summary(store_path_for(workspace_path));
}

/**
 * The repo-relative files that differ from HEAD — tracked working-tree edits plus untracked new files —
 * the set a reconcile preview should run over. A git failure logs and yields the empty set (the caller
 * treats that as "nothing to preview").
 */
function changed_files(workspace_path: string): string[] {
  const collect = (args: string[]): string[] => {
    const result = spawnSync("git", args, { cwd: workspace_path, encoding: "utf8" });
    if (result.status !== 0) {
      const detail = result.stderr?.trim() || result.error?.message || "unknown error";
      log(`drift preview: \`git ${args.join(" ")}\` failed: ${detail}`);
      return [];
    }
    return result.stdout.split("\n").map((f) => f.trim()).filter((f) => f.length > 0);
  };
  const tracked = collect(["diff", "--name-only", "HEAD"]);
  const untracked = collect(["ls-files", "--others", "--exclude-standard"]);
  return [...new Set([...tracked, ...untracked])];
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
  // Click-to-fix only when NOT armed (AC#2); an armed bar is a plain indicator. Manual re-install is
  // always reachable from the command palette.
  status_bar_item.command = state.warn ? INSTALL_DRIFT_COMMAND : undefined;
  status_bar_item.backgroundColor = state.warn
    ? new vscode.ThemeColor("statusBarItem.warningBackground")
    : undefined;
  status_bar_item.show();

  const store_path = store_path_for(workspace_path);
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
  // Dev mode: surface the store the drift loop is under development against — reveal the channel and
  // print its summary on every generate, so a developer sees what the reconcile has (or hasn't) written.
  if (is_dev_mode()) {
    output_channel?.show(true);
    log_store_summary(store_path_for(workspace_path));
  }
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
  const is_development = is_dev_mode();

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
  let call_graph_subscription: vscode.Disposable | undefined;

  // Tell the live webview the underlying data moved so it re-runs list_flows/render_flow in place. Fired
  // from the graph.db watcher (an out-of-process reconcile landed) and from on_call_graph_changed (an
  // in-process source edit) — one refresh channel for both.
  const post_store_changed = () => {
    panel.webview.postMessage({ command: "store_changed" });
  };

  // Lazily build the Ariadne call graph once, then serve it from the cached project manager. Both the
  // raw call-graph request and the flow handlers (which derive the skeleton from it) funnel through
  // here, so a re-extraction after a code change is picked up on the next request. A reconcile landing
  // out-of-process is pushed to the webview via post_store_changed, so the panel no longer waits for a
  // manual re-run to reflect a stitched umbrella or LLM description.
  const ensure_call_graph = async (): Promise<CallGraph> => {
    if (!project_manager) {
      // Index the same file set the drift reconcile engine does (HeadlessProject): every supported
      // source minus EXCLUDED_DIRS, tests included. The webview renders flows from the persisted store
      // the reconcile engine writes, so the two indexers must agree on which files exist — otherwise a
      // persisted flow whose seed lives in a file the webview skipped resolves to zero members and
      // renders empty. The default filter keeps `node_modules`/`.git`/etc. out via EXCLUDED_DIRS.
      project_manager = new AriadneProjectManager(workspace_path);
      // Both the manager's own file watchers and invalidate() (driven by the graph.db watcher) fire this
      // event; either way the webview refreshes. Disposed with the panel so a re-open starts clean.
      call_graph_subscription = project_manager.on_call_graph_changed(() => post_store_changed());
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

  // Watch the on-disk store the reconcile sub-agent writes: on a settled write, re-extract the call
  // graph (AC#2 — the reconcile followed a code change) which fires on_call_graph_changed and pushes
  // store_changed (AC#1). If no call graph is built yet, nudge the webview directly so a store write
  // that lands before the first request still refreshes. The store stays open-per-request and read-only
  // (AC#3): this watcher never opens graph.db, it only signals a re-read is due.
  const store_watcher = new StoreWatcher(work_folder.fsPath, graph_db_file, async () => {
    // Fire-and-forget from the debounce timer: catch here so a failed re-index surfaces in the
    // OutputChannel instead of becoming an unhandled rejection, and never blocks the extension host.
    // Dev mode narrates the watch→refresh cycle so the always-on auto-refresh is observable while the
    // drift loop is under development; the refresh itself runs for every user, dev mode or not. The two
    // branches take different refresh paths, so each narrates what it actually did.
    if (is_development) log("graph.db changed → refreshing");
    try {
      if (project_manager) {
        await project_manager.invalidate();
        if (is_development) log("call graph invalidated → webview repainted");
      } else {
        post_store_changed();
        if (is_development) log("webview notified to re-read the store (no call graph built yet)");
      }
    } catch (err) {
      log(`store-change refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  store_watcher.start();

  panel.onDidDispose(() => {
    project_manager?.dispose();
    project_manager = undefined;
    call_graph_subscription?.dispose();
    call_graph_subscription = undefined;
    store_watcher.dispose();
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
