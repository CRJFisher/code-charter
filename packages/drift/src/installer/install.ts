/**
 * The idempotent drift installer. Against a host layout it installs the `Stop` reconcile hook
 * entry and copies the `.claude` asset bundle (the `drift-reconciler` sub-agent, the
 * `drift-sync` skill, and the `/drift` fallback command). Re-running is safe: the hook merge
 * replaces only the drift entries, and asset copies overwrite in place.
 *
 * All decision logic lives in the pure merge functions; this module owns only the file I/O and
 * the install-time path resolution. `install_drift` takes `package_root` explicitly so tests can
 * run it against the real `assets/` tree without depending on a built `dist/`.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import {
  type HookArtifactSpec,
  type HostLayout,
} from "./host_layout";
import { merge_all_hooks } from "./merge_settings";

const STOP_BIN = "drift_stop_hook.js";
const RECONCILE_BIN = "drift_reconcile.js";

/** Sidecar the installer drops beside the drift-sync skill so its dependency-free script finds the bin. */
const RECONCILE_BIN_SIDECAR = ".drift_reconcile_bin";

/** The package root when running from a built `dist/` (installer compiled to dist/installer/). */
export function resolve_package_root(): string {
  return path.resolve(__dirname, "..", "..");
}

function bin_path(package_root: string, bin_filename: string): string {
  return path.join(package_root, "dist", "bin", bin_filename);
}

/**
 * The `node "<abs-bin>"` command a hook entry runs. The bin lives in the drift package — the installed
 * VS Code extension, or the dev checkout — never in the target repo, so the command carries an absolute
 * path to it. The hook runs with the target repo as cwd; an absolute path makes the bin resolvable
 * wherever the target repo and the package each sit. The installer re-asserts this on every install, so
 * a move of the package (e.g. an extension update to a new versioned folder) self-heals on the next run.
 */
export function hook_command(package_root: string, bin_filename: string): string {
  return `node "${bin_path(package_root, bin_filename)}"`;
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

/** Fail loudly if a bin a hook command points at has not been built yet. */
function assert_bin_built(package_root: string, bin_filename: string): void {
  const built = bin_path(package_root, bin_filename);
  if (!fs.existsSync(built)) {
    throw new Error(
      `drift install: ${built} not found. Build the package (npm run build) before installing.`,
    );
  }
}

/** The hook specs the installer writes, with their identity tokens for idempotency. */
export function build_hook_specs(package_root: string): HookArtifactSpec[] {
  return [
    {
      event_name: "Stop",
      command: hook_command(package_root, STOP_BIN),
      identity_token: "drift_stop_hook",
    },
  ];
}

/** Install (or refresh) the drift substrate into `target_root` for the given host layout. */
export function install_drift(target_root: string, layout: HostLayout, package_root: string): void {
  for (const bin of [STOP_BIN, RECONCILE_BIN]) {
    assert_bin_built(package_root, bin);
  }

  const specs = build_hook_specs(package_root);

  const settings_path = path.join(target_root, layout.settings_file);
  const merged_settings = merge_all_hooks(read_json(settings_path), layout, specs);
  write_json(settings_path, merged_settings);

  const assets_root = path.join(package_root, "assets");
  for (const asset of [layout.agents, layout.skills, layout.commands]) {
    copy_asset_tree(
      path.join(assets_root, asset.source_subdir),
      path.join(target_root, asset.target_subdir),
    );
  }

  // The drift-sync skill script is dependency-free and shells into the built reconcile bin; record the
  // bin's absolute path beside the installed skill so the script can locate it with no node_modules,
  // regardless of the cwd it runs from.
  const sidecar = path.join(target_root, layout.skills.target_subdir, "drift-sync", RECONCILE_BIN_SIDECAR);
  fs.writeFileSync(sidecar, bin_path(package_root, RECONCILE_BIN) + "\n");
}
