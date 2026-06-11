#!/usr/bin/env node
"use strict";

// drift-sync bundled script (task-27.1.6).
//
// This script is the single store-mutation entry for drift reconciliation, and it is intentionally
// dependency-free: it runs from an installed `.claude` directory where no node_modules is guaranteed.
// It validates the pinned contract, then SHELLS INTO the built `drift-reconcile` bin (which imports
// @code-charter/core and drives the headless Ariadne reconcile engine). It locates that bin via the
// `DRIFT_RECONCILE_BIN` env var, or the `.drift_reconcile_bin` sidecar the installer writes next to this
// skill.
//
// Three invocation modes, mirroring the bin:
//   - default / `--list-entrypoints`: the deterministic reconcile over the changed-file set (list mode
//     additionally emits the entrypoint inventory JSON the agent's stitch judgement reads). The file
//     set comes from the pending-reconcile file the Stop hook stages beside the store
//     (`drift_pending_reconcile.json`, format `{ files: [...] }` — mirrored from
//     src/hooks/pending_reconcile.ts; this script runs standalone and cannot import it), CONSUMED
//     (deleted) after a successful non-dry run so a failed reconcile retries next launch. The manual
//     `/drift` path passes `--files <a,b,...>` explicitly and leaves the staged set untouched.
//   - `--apply-stitch <json_path>` / `--apply-descriptions <json_path>`: the agent's judgement
//     phases. No file set is involved and the pending file is never read or consumed.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const USAGE =
  "usage: drift_sync.js --store <db_path> --repo-root <abs> [--files <a,b,...>] [--list-entrypoints | --apply-stitch <json_path> | --apply-descriptions <json_path>] [--json] [--dry-run]";

// Mirrored from src/hooks/pending_reconcile.ts (the Stop-hook side of the handoff).
const PENDING_RECONCILE_FILE = "drift_pending_reconcile.json";

const VALUE_FLAGS = {
  "--files": "files",
  "--store": "store",
  "--repo-root": "repo_root",
  "--apply-stitch": "apply_stitch",
  "--apply-descriptions": "apply_descriptions",
};

function parse_args(argv) {
  const args = {
    files: null,
    store: null,
    repo_root: null,
    apply_stitch: null,
    apply_descriptions: null,
    list_entrypoints: false,
    json: false,
    dry_run: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const field = VALUE_FLAGS[token];
    if (field !== undefined) {
      const value = argv[i + 1];
      // A value-flag at the end of argv, or immediately followed by another flag, has no value:
      // reject it as a usage error (exit 2) rather than letting `undefined` slip past validation.
      if (value === undefined || value.startsWith("--")) {
        return { error: `missing value for ${token}` };
      }
      args[field] = value;
      i++;
    } else if (token === "--list-entrypoints") {
      args.list_entrypoints = true;
    } else if (token === "--json") {
      args.json = true;
    } else if (token === "--dry-run") {
      args.dry_run = true;
    } else {
      return { error: `unknown argument: ${token}` };
    }
  }
  if (args.store === null) return { error: "missing required --store" };
  if (args.repo_root === null) return { error: "missing required --repo-root" };
  const modes = [args.list_entrypoints, args.apply_stitch !== null, args.apply_descriptions !== null];
  if (modes.filter(Boolean).length > 1) return { error: "at most one mode flag is allowed" };
  return { args };
}

function split_files(files_value) {
  return files_value
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Read the staged set, or null when absent/malformed (nothing pending). */
function read_pending_files(pending_path) {
  let raw;
  try {
    raw = fs.readFileSync(pending_path, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray(parsed.files) &&
      parsed.files.every((f) => typeof f === "string")
    ) {
      return parsed.files;
    }
  } catch {
    /* malformed → nothing pending */
  }
  process.stderr.write(`drift-sync: ignoring malformed pending file at ${pending_path}\n`);
  return null;
}

/** Locate the built drift-reconcile bin: env override first, then the installer-written sidecar. */
function locate_reconcile_bin() {
  const from_env = process.env.DRIFT_RECONCILE_BIN;
  if (from_env && from_env.length > 0) return from_env;
  // The installer writes the absolute bin path here, beside the installed skill (../ up from scripts/).
  const sidecar = path.join(__dirname, "..", ".drift_reconcile_bin");
  try {
    const recorded = fs.readFileSync(sidecar, "utf8").trim();
    if (recorded.length > 0) return recorded;
  } catch {
    // no sidecar present
  }
  return null;
}

function spawn_bin(args, forwarded_tail) {
  let bin = locate_reconcile_bin();
  if (bin === null) {
    process.stderr.write(
      "drift-sync: reconcile bin not located. Set DRIFT_RECONCILE_BIN or re-run `drift-install`.\n",
    );
    process.exit(1);
  }
  // The sidecar records a repo-relative path (portable across checkouts); resolve it against the repo
  // root so the spawn works regardless of the cwd the skill happens to run from.
  if (!path.isAbsolute(bin)) bin = path.resolve(args.repo_root, bin);

  const forwarded = [bin, ...forwarded_tail, "--store", args.store, "--repo-root", args.repo_root];
  if (args.json) forwarded.push("--json");
  if (args.dry_run) forwarded.push("--dry-run");

  const result = spawnSync("node", forwarded, { stdio: "inherit" });
  if (result.error) {
    process.stderr.write(`drift-sync: failed to run reconcile bin: ${result.error.message}\n`);
    process.exit(1);
  }
  return result.status === null ? 1 : result.status;
}

function main() {
  const parsed = parse_args(process.argv.slice(2));
  if (parsed.error) {
    process.stderr.write(`drift-sync: ${parsed.error}\n${USAGE}\n`);
    process.exit(2);
  }
  const { args } = parsed;

  // The judgement phases carry their own payload; no file set, no pending-file involvement.
  if (args.apply_stitch !== null) {
    process.exit(spawn_bin(args, ["--apply-stitch", args.apply_stitch]));
  }
  if (args.apply_descriptions !== null) {
    process.exit(spawn_bin(args, ["--apply-descriptions", args.apply_descriptions]));
  }

  const pending_path = path.join(path.dirname(args.store), PENDING_RECONCILE_FILE);
  const from_pending = args.files === null;
  const files = from_pending ? (read_pending_files(pending_path) ?? []) : split_files(args.files);

  // An empty file set is a clean no-op without needing the bin (mirrors the bin's own empty-set path).
  if (files.length === 0) {
    if (args.list_entrypoints) process.stdout.write(JSON.stringify({ entrypoints: [] }) + "\n");
    else if (args.json) process.stdout.write("[]\n");
    process.stderr.write(
      from_pending
        ? "drift-sync: nothing staged in the pending file, no-op for 0 file(s)\n"
        : "drift-sync: empty file set, no-op for 0 file(s)\n",
    );
    process.exit(0);
  }

  const mode_flags = args.list_entrypoints ? ["--list-entrypoints"] : [];
  const status = spawn_bin(args, [...mode_flags, "--files", files.join(",")]);
  // Consume the staged set only after a successful mutating run; a failure (or dry run) leaves it
  // for the next launch to retry, and the Stop hook unions further turns into it meanwhile. The
  // list pass IS the mutating deterministic reconcile, so it consumes too — the judgement phases
  // that follow it are additive refinements that need no staged set.
  if (from_pending && status === 0 && !args.dry_run) {
    try {
      fs.unlinkSync(pending_path);
    } catch {
      /* already gone — nothing to consume */
    }
  }
  process.exit(status);
}

main();
