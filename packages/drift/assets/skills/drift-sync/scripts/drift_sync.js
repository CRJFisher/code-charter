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
// One headless default mode plus the three agentic modes, mirroring the bin:
//   - default / `--list-entrypoints`: the deterministic reconcile over the changed-file set (list mode
//     additionally emits the entrypoint inventory JSON the agent's stitch judgement reads). The file
//     set comes from the pending-reconcile file the Stop hook stages beside the store
//     (`drift_pending_reconcile.json`, format `{ version, files, session }` per
//     docs/contracts/pending_reconcile_handoff.md — mirrored from src/hooks/pending_reconcile.ts;
//     this script runs standalone and cannot import it). The staged `session` (transcript join key +
//     verbatim instruction) is forwarded to the bin as `--session-id`/`--session-cwd`/`--instruction`
//     so the run record can carry it; the manual `--files` path forwards none. Before the
//     reconcile starts, the pending file is CLAIMED — renamed (atomic, same directory) to the
//     pid-stamped `drift_pending_reconcile.claim.<pid>.json` — so the post-run settle can never touch
//     a set the Stop hook stages mid-reconcile. The claim is deleted after a successful run and
//     unioned back into the live pending file (temp-file + atomic rename) on failure; a claim left
//     by a crashed run (dead, recycled-own, or zero pid) is unioned back on the next launch.
//     `--dry-run` reads the pending file without claiming (detection is side-effect-free). The
//     manual `/drift` path passes `--files <a,b,...>` explicitly and leaves the staged set
//     untouched.
//   - `--apply-stitch <json_path>` / `--apply-descriptions <json_path>`: the agent's judgement
//     phases. No file set is involved and the pending file is never read or consumed.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const USAGE =
  "usage: drift_sync.js --store <db_path> --repo-root <abs> [--files <a,b,...>] [--list-entrypoints | --apply-stitch <json_path> | --apply-descriptions <json_path>] [--json] [--dry-run]";

// Mirrored from src/hooks/pending_reconcile.ts (the Stop-hook side of the handoff).
const PENDING_RECONCILE_FILE = "drift_pending_reconcile.json";
// The consumer's private working name. Pid-stamped so a leftover claim's owner is decidable —
// the same dead-pid test as reconcile_lock's reclaim_if_stale: a dead pid marks a crashed run
// whose set must be recovered, a live one a running peer whose claim must not be stolen. A pid
// recycled by an unrelated process is indistinguishable from a live peer; that residual window
// is accepted.
const PENDING_CLAIM_PATTERN = /^drift_pending_reconcile\.claim\.(\d+)\.json$/;

function claim_path_for(pending_path) {
  return path.join(path.dirname(pending_path), `drift_pending_reconcile.claim.${process.pid}.json`);
}

/** Temp-file + atomic rename: the concurrent Stop hook must never observe a half-written file. */
function write_pending_atomic(pending_path, files, session) {
  const tmp_path = `${pending_path}.${process.pid}.tmp`;
  fs.writeFileSync(tmp_path, JSON.stringify({ version: 1, files, session: session ?? null }));
  try {
    fs.renameSync(tmp_path, pending_path);
  } catch (err) {
    fs.rmSync(tmp_path, { force: true });
    throw err;
  }
}

/** First-seen-order union — mirrors merge_pending_reconcile in src/hooks/pending_reconcile.ts. */
function union_files(prior, current) {
  return [...new Set([...prior, ...current])];
}

/**
 * Union `files` into whatever is staged NOW, with `files` taking first-seen precedence over the
 * staged set. The Stop hook may have re-created the pending file mid-reconcile, so this
 * reads-merges-renames rather than blindly renaming a claim back — a blind rename would clobber
 * the newly staged set (the original consume race, in reverse). The live pending file's session
 * wins over the restaged one (newest contributor, mirroring merge_pending_reconcile): a Stop fire
 * mid-reconcile staged a fresher join key than the claim being folded back.
 */
function union_into_pending(pending_path, files, session) {
  const current = read_pending(pending_path);
  write_pending_atomic(pending_path, union_files(files, current?.files ?? []), current?.session ?? session ?? null);
}

function is_pid_alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: alive under another user — treat as alive; never steal a claim of unknown liveness.
    return err.code !== "ESRCH";
  }
}

/**
 * Fold claims orphaned by a crashed run back into the pending file so their edits are reconciled
 * on this launch — the transcript watermark has already advanced past them, so the claim file is
 * the only remaining record. A claim stamped with this process's own pid is always stale (this
 * run has not claimed yet), and one whose pid parses to 0 could probe the whole process group —
 * both are recovered without a liveness check. A malformed orphan is discarded: it was never a
 * recoverable set. Each orphan settles independently so one unrecoverable claim cannot block the
 * others or this run's own claim.
 */
function recover_orphaned_claims(pending_path) {
  let names;
  try {
    names = fs.readdirSync(path.dirname(pending_path));
  } catch {
    return;
  }
  for (const name of names) {
    const match = PENDING_CLAIM_PATTERN.exec(name);
    if (match === null) continue;
    const pid = Number(match[1]);
    if (pid > 0 && pid !== process.pid && is_pid_alive(pid)) continue;
    const orphan_path = path.join(path.dirname(pending_path), name);
    try {
      const orphan = read_pending(orphan_path);
      if (orphan !== null && orphan.files.length > 0) {
        union_into_pending(pending_path, orphan.files, orphan.session);
        process.stderr.write(
          `drift-sync: recovered ${orphan.files.length} file(s) from a crashed reconcile (pid ${pid})\n`,
        );
      }
      fs.rmSync(orphan_path, { force: true });
    } catch {
      /* left for a later launch */
    }
  }
}

/** Atomically move the staged set out of the live path; null when nothing is staged. */
function claim_pending(pending_path) {
  const claim = claim_path_for(pending_path);
  try {
    fs.renameSync(pending_path, claim);
  } catch {
    return null; // ENOENT — nothing staged
  }
  return claim;
}

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

/**
 * Read the staged handoff `{ files, session }`, or null when absent/malformed (nothing pending).
 * A malformed session degrades to null while the files survive — the file set must never be
 * dropped over broken metadata. Mirrors parse_pending_reconcile in src/hooks/pending_reconcile.ts.
 */
function read_pending(pending_path) {
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
      return { files: parsed.files, session: parse_session(parsed.session) };
    }
  } catch {
    /* malformed → nothing pending */
  }
  process.stderr.write(`drift-sync: ignoring malformed pending file at ${pending_path}\n`);
  return null;
}

function parse_session(value) {
  if (typeof value !== "object" || value === null) return null;
  if (
    typeof value.session_id !== "string" ||
    typeof value.cwd !== "string" ||
    typeof value.instruction !== "string"
  ) {
    return null;
  }
  return { session_id: value.session_id, cwd: value.cwd, instruction: value.instruction };
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

// Returns the bin's exit code; failures return nonzero rather than exiting so the caller can
// settle a claimed pending set (an early exit here would orphan the claim until the next launch).
function spawn_bin(args, forwarded_tail) {
  const bin = locate_reconcile_bin();
  if (bin === null) {
    process.stderr.write(
      "drift-sync: reconcile bin not located. Set DRIFT_RECONCILE_BIN or re-run `drift-install`.\n",
    );
    return 1;
  }

  const forwarded = [bin, ...forwarded_tail, "--store", args.store, "--repo-root", args.repo_root];
  if (args.json) forwarded.push("--json");
  if (args.dry_run) forwarded.push("--dry-run");

  const result = spawnSync("node", forwarded, { stdio: "inherit" });
  if (result.error) {
    process.stderr.write(`drift-sync: failed to run reconcile bin: ${result.error.message}\n`);
    return 1;
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

  // A mutating run CLAIMS the staged set (rename out of the live path) before the reconcile
  // starts, so the settle below can never touch a set the Stop hook stages mid-reconcile. The
  // list pass IS the mutating deterministic reconcile, so it claims too. Dry runs read without
  // claiming — detection must leave the staged set exactly as found.
  let claim = null;
  let files;
  let session = null;
  if (!from_pending) {
    files = split_files(args.files);
  } else if (args.dry_run) {
    files = read_pending(pending_path)?.files ?? [];
  } else {
    recover_orphaned_claims(pending_path);
    claim = claim_pending(pending_path);
    const claimed = claim === null ? null : read_pending(claim);
    files = claimed?.files ?? [];
    session = claimed?.session ?? null;
    if (claim !== null && files.length === 0) {
      // An empty or malformed claim carries nothing to reconcile or recover — discard it rather
      // than strand a dead claim file.
      fs.rmSync(claim, { force: true });
      claim = null;
    }
  }

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
  const session_flags =
    session === null
      ? []
      : ["--session-id", session.session_id, "--session-cwd", session.cwd, "--instruction", session.instruction];
  const status = spawn_bin(args, [...mode_flags, "--files", files.join(","), ...session_flags]);
  // Settle the claim by outcome: a successful mutating run consumed the set, so the claim is
  // deleted; any failure unions it back into the live pending file for the next launch to retry
  // (the Stop hook keeps unioning further turns into that file meanwhile).
  if (claim !== null) {
    if (status === 0) {
      fs.rmSync(claim, { force: true });
    } else {
      try {
        union_into_pending(pending_path, files, session);
        process.stderr.write(`drift-sync: reconcile failed, restaged ${files.length} file(s) for retry\n`);
        fs.rmSync(claim, { force: true });
      } catch {
        // The claim stays and the next launch recovers it by its dead pid; if only the rm
        // failed, the recovery re-unions an already-restaged set, which dedups to a no-op.
      }
    }
  }
  process.exit(status);
}

main();
