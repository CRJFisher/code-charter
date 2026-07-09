#!/usr/bin/env node
/**
 * The `drift-dev` bin — the single-command deterministic reconcile loop for iterating on reconcile
 * logic without a Claude session or a token spend.
 *
 * The edit→observe loop for reconcile changes otherwise spans three process contexts (rebuild, a full
 * Claude session in a target repo, manual sqlite3). For a purely deterministic change — one that needs
 * no agent at all — this collapses that into one command: it copies the repo's graph store to a scratch
 * location, runs the real deterministic reconcile (the `default` mode: resync / retire / singleton
 * hydration) against the copy, and prints a before/after diff of flows, descriptions, and bridges. The
 * real store is never touched; the agentic modes (stitch, describe) are never invoked, so no tokens are
 * spent. Reuses the .4 inspect summary/diff rendering.
 *
 * usage: drift-dev --repo <abs> --files <a,b,...> [--store <db_path>] [--goal <name>] [--json]
 *
 * `--store` defaults to the repo's `.code-charter/graph.db` (honoring the `CODE_CHARTER_DB` override).
 * `--json` emits `{ outcomes, diff }` instead of text. Exit 0 = rendered a diff (including a no-op),
 * 2 = usage error, 1 = fatal.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { open_graph_store } from "@code-charter/core";

import { resolve_db_path } from "../hooks/resolve_db_path";
import { make_ariadne_adapter } from "../reconcile/ariadne_adapter";
import { HeadlessProject } from "../reconcile/headless_project";
import { reconcile } from "../reconcile/reconcile";
import type { DetectionGoal, ReconcileDeps, ReconcileResult } from "../reconcile/types";
import { collect_store_summary } from "../inspect/summary";
import { diff_summaries } from "../inspect/diff";
import { read_inspect_input } from "../inspect/read_input";
import { render_summary_diff } from "../inspect/render";

const USAGE = "usage: drift-dev --repo <abs> --files <a,b,...> [--store <db_path>] [--goal <name>] [--json]";

interface Args {
  repo: string;
  files: string[];
  store: string;
  goal: DetectionGoal | undefined;
  json: boolean;
}

const VALUE_FLAGS: Record<string, "repo" | "files_raw" | "store" | "goal"> = {
  "--repo": "repo",
  "--files": "files_raw",
  "--store": "store",
  "--goal": "goal",
};

function parse_args(argv: readonly string[]): { args: Args } | { error: string } {
  const raw: { repo?: string; files_raw?: string; store?: string; goal?: string; json: boolean } = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const field = VALUE_FLAGS[token];
    if (field !== undefined) {
      const value = argv[i + 1];
      if (value === undefined || value.length === 0 || value.startsWith("--")) {
        return { error: `missing value for ${token}` };
      }
      raw[field] = value;
      i++;
    } else if (token === "--json") {
      raw.json = true;
    } else {
      return { error: `unknown argument: ${token}` };
    }
  }
  if (raw.repo === undefined) return { error: "missing required --repo" };
  if (raw.files_raw === undefined) return { error: "missing required --files" };
  const files = raw.files_raw.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
  if (files.length === 0) return { error: "--files names no files" };
  const repo_abs = path.resolve(raw.repo);
  const store = raw.store ?? resolve_db_path(process.env, repo_abs);
  return { args: { repo: repo_abs, files, store, goal: raw.goal, json: raw.json } };
}

/**
 * Copy the store (and its WAL sidecars, so a not-yet-checkpointed commit is not lost) into a fresh
 * scratch dir, returning the scratch store path. A missing source store is a cold repo: the reconcile
 * creates the scratch db from scratch, and the before-summary is empty.
 *
 * drift-dev is a manual, quiescent dev tool: it takes no reconcile lock because it only ever mutates
 * the throwaway copy. If a live reconcile is checkpointing concurrently, a sidecar can vanish between
 * the existence check and the copy — caught here and surfaced as a clear "retry" message rather than a
 * raw ENOENT fatal.
 */
function stage_scratch_store(source_store: string, scratch_dir: string): string {
  const scratch_store = path.join(scratch_dir, path.basename(source_store));
  try {
    for (const suffix of ["", "-wal", "-shm"]) {
      const src = source_store + suffix;
      if (fs.existsSync(src)) fs.copyFileSync(src, scratch_store + suffix);
    }
  } catch (error: unknown) {
    // Only a vanished sidecar (ENOENT between the check and the copy) points at a concurrent
    // checkpoint; surface every other cause (disk full, permissions) unaltered.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `store changed while copying it to a scratch dir (is a reconcile running concurrently? re-run when idle): ${String(error)}`,
      );
    }
    throw error;
  }
  return scratch_store;
}

/** Run the deterministic reconcile against the scratch store, mutating the copy. */
async function reconcile_scratch(
  scratch_store: string,
  repo_abs: string,
  files: readonly string[],
  goal: DetectionGoal | undefined,
  log: (message: string) => void,
): Promise<ReconcileResult> {
  const store = open_graph_store(scratch_store);
  try {
    const project = new HeadlessProject(repo_abs);
    await project.initialize();
    const adapter = make_ariadne_adapter(project, log);
    const deps: ReconcileDeps = {
      store,
      adapter,
      repo_root_abs: repo_abs,
      analyzed_root: "",
      goal,
      now: () => new Date().toISOString(),
      log,
    };
    return await reconcile(files, deps);
  } finally {
    store.close();
  }
}

async function main(): Promise<void> {
  const parsed = parse_args(process.argv.slice(2));
  if ("error" in parsed) {
    process.stderr.write(`drift-dev: ${parsed.error}\n${USAGE}\n`);
    process.exit(2);
  }
  const { args } = parsed;
  const log = (message: string): void => {
    process.stderr.write(`drift-dev: ${message}\n`);
  };

  const before = collect_store_summary(read_inspect_input(args.store));

  const scratch_dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-dev-"));
  try {
    const scratch_store = stage_scratch_store(args.store, scratch_dir);
    const result = await reconcile_scratch(scratch_store, args.repo, args.files, args.goal, log);
    const after = collect_store_summary(read_inspect_input(scratch_store));
    const diff = diff_summaries(before, after);

    if (args.json) {
      process.stdout.write(JSON.stringify({ outcomes: result.outcomes, diff }, null, 2) + "\n");
    } else {
      process.stdout.write(
        `deterministic reconcile over ${args.files.length} file(s) — no Claude session, no token spend\n\n`,
      );
      process.stdout.write(render_summary_diff(diff).join("\n") + "\n");
    }
  } finally {
    fs.rmSync(scratch_dir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`drift-dev: fatal: ${String(error)}\n`);
  process.exit(1);
});
