/**
 * The idempotent drift installer. Against a host layout it installs exactly two hook entries
 * (a `Stop` reconcile hook and a read-only `SessionStart` banner hook), registers the `drift`
 * MCP server, and copies the `.claude` asset bundle (the `drift-reconciler` sub-agent, the
 * `drift-sync` skill, and the `/drift` fallback command). Re-running is safe: hook/MCP merges
 * replace only the drift entries, and asset copies overwrite in place.
 *
 * All decision logic lives in the pure merge functions; this module owns only the file I/O and
 * the install-time path resolution. `install_drift` takes `package_root` explicitly so tests can
 * run it against the real `assets/` tree without depending on a built `dist/`.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { DRIFT_DB_ENV_VAR } from "../mcp/resolve_db_path";

import {
  type HookArtifactSpec,
  type HostLayout,
} from "./host_layout";
import { merge_all_hooks, merge_mcp_server, type McpServerEntry } from "./merge_settings";

/** The MCP server name the `drift.*` tools register under. */
export const DRIFT_MCP_SERVER_NAME = "drift";

const STOP_BIN = "drift_stop_hook.js";
const SESSION_START_BIN = "drift_session_start.js";
const MCP_BIN = "drift_mcp.js";
const RECONCILE_BIN = "drift_reconcile.js";

/** Sidecar the installer drops beside the drift-sync skill so its dependency-free script finds the bin. */
const RECONCILE_BIN_SIDECAR = ".drift_reconcile_bin";

// The store path is named by DRIFT_DB_ENV_VAR (CODE_CHARTER_DB) — the same var the MCP server and
// the drift-sync skill resolve — so the installer pins all three to one path.
const DB_RELATIVE_PATH = path.join(".code-charter", "graph.db");

/** The package root when running from a built `dist/` (installer compiled to dist/installer/). */
export function resolve_package_root(): string {
  return path.resolve(__dirname, "..", "..");
}

function bin_path(package_root: string, bin_filename: string): string {
  return path.join(package_root, "dist", "bin", bin_filename);
}

/** The `node <abs-bin>` command string a hook entry runs. */
export function hook_command(package_root: string, bin_filename: string): string {
  return `node ${bin_path(package_root, bin_filename)}`;
}

/**
 * Read a JSON config that may be absent. An ABSENT file yields `{}` (a fresh base to merge into);
 * a PRESENT file that fails to parse throws rather than returning `{}`, so the installer never
 * silently overwrites a hand-edited-but-malformed settings file and discards real config.
 */
function read_json(file_path: string): unknown {
  let raw: string;
  try {
    raw = fs.readFileSync(file_path, "utf8");
  } catch {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      `drift install: ${file_path} exists but is not valid JSON. ` +
        "Fix or remove it before installing — refusing to overwrite and lose its contents.",
    );
  }
}

function write_json(file_path: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file_path), { recursive: true });
  fs.writeFileSync(file_path, JSON.stringify(value, null, 2) + "\n");
}

function copy_asset_tree(source_dir: string, target_dir: string): void {
  fs.mkdirSync(target_dir, { recursive: true });
  fs.cpSync(source_dir, target_dir, { recursive: true });
}

/** Fail loudly if a bin a hook/MCP command points at has not been built yet. */
function assert_bin_built(package_root: string, bin_filename: string): void {
  const built = bin_path(package_root, bin_filename);
  if (!fs.existsSync(built)) {
    throw new Error(
      `drift install: ${built} not found. Build the package (npm run build) before installing.`,
    );
  }
}

/** The two hook specs the installer writes, with their identity tokens for idempotency. */
export function build_hook_specs(package_root: string): HookArtifactSpec[] {
  return [
    {
      event_name: "Stop",
      matcher: null,
      command: hook_command(package_root, STOP_BIN),
      identity_token: "drift_stop_hook",
    },
    {
      event_name: "SessionStart",
      matcher: "startup",
      command: hook_command(package_root, SESSION_START_BIN),
      identity_token: "drift_session_start",
    },
  ];
}

/** Install (or refresh) the drift substrate into `target_root` for the given host layout. */
export function install_drift(target_root: string, layout: HostLayout, package_root: string): void {
  for (const bin of [STOP_BIN, SESSION_START_BIN, MCP_BIN, RECONCILE_BIN]) {
    assert_bin_built(package_root, bin);
  }

  const specs = build_hook_specs(package_root);

  const settings_path = path.join(target_root, layout.settings_file);
  const merged_settings = merge_all_hooks(read_json(settings_path), layout, specs);
  write_json(settings_path, merged_settings);

  // The MCP server is pinned to the target repo's store via CODE_CHARTER_DB so it never depends
  // on the cwd it happens to be launched from; the drift-sync skill resolves the same path.
  const mcp_path = path.join(target_root, layout.mcp_config_file);
  const mcp_entry: McpServerEntry = {
    command: "node",
    args: [bin_path(package_root, MCP_BIN)],
    env: { [DRIFT_DB_ENV_VAR]: path.join(target_root, DB_RELATIVE_PATH) },
  };
  const merged_mcp = merge_mcp_server(read_json(mcp_path), DRIFT_MCP_SERVER_NAME, mcp_entry);
  write_json(mcp_path, merged_mcp);

  const assets_root = path.join(package_root, "assets");
  for (const asset of [layout.agents, layout.skills, layout.commands]) {
    copy_asset_tree(
      path.join(assets_root, asset.source_subdir),
      path.join(target_root, asset.target_subdir),
    );
  }

  // The drift-sync skill script is dependency-free and shells into the built reconcile bin; record the
  // bin's absolute path beside the installed skill so the script can locate it with no node_modules.
  const sidecar = path.join(target_root, layout.skills.target_subdir, "drift-sync", RECONCILE_BIN_SIDECAR);
  fs.writeFileSync(sidecar, bin_path(package_root, RECONCILE_BIN) + "\n");
}
