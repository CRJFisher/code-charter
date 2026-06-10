#!/usr/bin/env node
"use strict";

// drift-sync bundled script (task-27.1.6).
//
// This script is the single store-mutation entry for drift reconciliation, and it is intentionally
// dependency-free: it runs from an installed `.claude` directory where no node_modules is guaranteed.
// It validates the pinned contract, then SHELLS INTO the built `drift-reconcile` bin (which imports
// @code-charter/core and drives the headless Ariadne reconcile engine). It locates that bin via the
// `DRIFT_RECONCILE_BIN` env var, or the `.drift_reconcile_bin` sidecar the installer writes next to this
// skill. An empty file set no-ops; the bin reports per-flow hydrate/resync/retire over the changed files.
//
// The changed-file set comes from one of two sources:
//   - DEFAULT (no `--files`): the pending-reconcile file the Stop hook stages beside the store
//     (`drift_pending_reconcile.json`, format `{ files: [...] }` — mirrored from
//     src/hooks/pending_reconcile.ts; this script runs standalone and cannot import it). This is the
//     hook path: the file list never travels through the main agent's context. The pending file is
//     CONSUMED (deleted) after a successful non-dry run, so a failed reconcile retries next launch.
//   - `--files <a,b,...>`: an explicit set, for the manual `/drift` path where no Stop hook ran and
//     nothing is staged. The pending file is untouched.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const USAGE =
  "usage: drift_sync.js --store <db_path> --repo-root <abs> [--files <a,b,...>] [--json] [--dry-run]";

// Mirrored from src/hooks/pending_reconcile.ts (the Stop-hook side of the handoff).
const PENDING_RECONCILE_FILE = "drift_pending_reconcile.json";

const VALUE_FLAGS = { "--files": "files", "--store": "store", "--repo-root": "repo_root" };

function parse_args(argv) {
  const args = { files: null, store: null, repo_root: null, json: false, dry_run: false };
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

function main() {
  const parsed = parse_args(process.argv.slice(2));
  if (parsed.error) {
    process.stderr.write(`drift-sync: ${parsed.error}\n${USAGE}\n`);
    process.exit(2);
  }
  const { args } = parsed;
  const pending_path = path.join(path.dirname(args.store), PENDING_RECONCILE_FILE);
  const from_pending = args.files === null;
  const files = from_pending ? (read_pending_files(pending_path) ?? []) : split_files(args.files);

  // An empty file set is a clean no-op without needing the bin (mirrors the bin's own empty-set path).
  if (files.length === 0) {
    if (args.json) process.stdout.write("[]\n");
    process.stderr.write(
      from_pending
        ? "drift-sync: nothing staged in the pending file, no-op for 0 file(s)\n"
        : "drift-sync: empty file set, no-op for 0 file(s)\n",
    );
    process.exit(0);
  }

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

  const forwarded = [bin, "--files", files.join(","), "--store", args.store, "--repo-root", args.repo_root];
  if (args.json) forwarded.push("--json");
  if (args.dry_run) forwarded.push("--dry-run");

  const result = spawnSync("node", forwarded, { stdio: "inherit" });
  if (result.error) {
    process.stderr.write(`drift-sync: failed to run reconcile bin: ${result.error.message}\n`);
    process.exit(1);
  }
  const status = result.status === null ? 1 : result.status;
  // Consume the staged set only after a successful mutating run; a failure (or dry run) leaves it
  // for the next launch to retry, and the Stop hook unions further turns into it meanwhile.
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
