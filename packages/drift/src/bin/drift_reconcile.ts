#!/usr/bin/env node
/**
 * The `drift-reconcile` bin — the store-mutating reconcile engine the `drift-sync` skill shells into.
 * The skill script is dependency-free and cannot import `@code-charter/core`, so it spawns this built
 * bin with a pinned contract.
 *
 * One headless default mode plus the three agentic modes the drift-sync skill orchestrates,
 * dispatched by flag (at most one):
 *  - default — the deterministic reconcile: resync/retire/skill-dir plus one-singleton-flow-per-new-
 *    entrypoint hydration. The complete path for hosts without an agent.
 *  - `--list-entrypoints` — runs the same deterministic reconcile, then emits the changed
 *    neighbourhood's entrypoint inventory as JSON on stdout (the agent's phase-1 input).
 *  - `--apply-stitch <json>` — hydrates agent-judged umbrellas as multi-seed flows with
 *    `agentic.bridge` edges, retires absorbed singletons, and returns the flow shape as JSON.
 *  - `--apply-descriptions <json>` — persists agent-authored member descriptions through the scoped
 *    write path, honoring the content-hash description cache.
 *
 * It opens the graph store (degrading to a no-op `NullGraphStore` on a host without the SQLite engine)
 * and builds the headless Ariadne call graph over the repo. Exit 0 = success or no-op, 2 = usage or
 * wire-contract error, 1 = fatal or reconcile contention (another reconcile holds the mutex; staged
 * work is preserved and retried). Mode JSON goes to stdout; diagnostics go to stderr with the
 * `drift-reconcile:` prefix.
 *
 * Every store-mutating run holds the process-level reconcile mutex (a lockfile beside the store),
 * so a Stop-hook reconcile and a manual one can never interleave writes. Contention past the
 * bounded wait exits 1 — nonzero, so drift_sync.js leaves the pending handoff file for the next
 * launch instead of consuming it over work that never ran. `--dry-run` never mutates and takes no
 * lock.
 *
 * Every mutating run also leaves a durable record beside the store (reconcile_log.ts): a per-turn
 * JSONL line in `drift_reconcile_log.jsonl` and a last-attempt/last-success/last-error rollup in
 * `drift_reconcile_status.json` — so a failed or dropped reconcile is distinguishable from a
 * healthy no-op after the session transcript is gone. `--dry-run` writes neither.
 */

import * as fs from "node:fs";

import { NullGraphStore, open_graph_store, type GraphStore } from "@code-charter/core";

import {
  apply_descriptions,
  apply_stitch,
  build_entrypoint_inventory,
  parse_apply_descriptions,
  parse_apply_stitch,
} from "../reconcile/agentic_modes";
import { make_ariadne_adapter } from "../reconcile/ariadne_adapter";
import { HeadlessProject } from "../reconcile/headless_project";
import { dry_run_store } from "../reconcile/dry_run_store";
import { acquire_reconcile_lock, type ReconcileLock } from "../reconcile/reconcile_lock";
import { derive_transcript_path } from "../hooks/transcript_path";
import {
  append_reconcile_log,
  make_run_id,
  update_sync_status,
  RECONCILE_RECORD_SCHEMA_VERSION,
  type ReconcileRunDetail,
  type ReconcileRunRecord,
  type ReconcileMode,
} from "../reconcile/reconcile_log";
import { reconcile } from "../reconcile/reconcile";
import { to_repo_relative } from "../reconcile/paths";
import type { DescriptionCounts, ReconcileDeps, ReconcileResult } from "../reconcile/types";

const USAGE = [
  "usage: drift-reconcile --files <a,b,...> --store <db_path> --repo-root <abs> [--goal <name>] [--json] [--dry-run]",
  "       drift-reconcile --list-entrypoints --files <a,b,...> --store <db_path> --repo-root <abs> [--goal <name>] [--dry-run]",
  "       drift-reconcile --apply-stitch <json_path> --store <db_path> --repo-root <abs> [--dry-run]",
  "       drift-reconcile --apply-descriptions <json_path> --store <db_path> --repo-root <abs> [--dry-run]",
  "       any mode also accepts --session-id <id> --session-cwd <abs> --instruction <text> (the run-record join key)",
].join("\n");

interface Args {
  mode: ReconcileMode;
  files: string[];
  store: string;
  repo_root: string;
  json: boolean;
  dry_run: boolean;
  goal: string | undefined;
  /** The wire-JSON path for the apply modes. */
  payload_path: string | undefined;
  /**
   * The launching session's context, forwarded by drift_sync.js off the staged handoff
   * (docs/contracts/pending_reconcile_handoff.md); all absent on hand-invoked runs, which is
   * what makes the record's session_id null.
   */
  session_id: string | undefined;
  session_cwd: string | undefined;
  instruction: string | undefined;
}

const VALUE_FLAGS: Record<
  string,
  "files_raw" | "store" | "repo_root" | "goal" | "apply_stitch" | "apply_descriptions" | "session_id" | "session_cwd" | "instruction"
> = {
  "--files": "files_raw",
  "--store": "store",
  "--repo-root": "repo_root",
  "--goal": "goal",
  "--apply-stitch": "apply_stitch",
  "--apply-descriptions": "apply_descriptions",
  "--session-id": "session_id",
  "--session-cwd": "session_cwd",
  "--instruction": "instruction",
};

function parse_args(argv: readonly string[]): { args: Args } | { error: string } {
  const raw: {
    files_raw?: string;
    store?: string;
    repo_root?: string;
    goal?: string;
    apply_stitch?: string;
    apply_descriptions?: string;
    session_id?: string;
    session_cwd?: string;
    instruction?: string;
    list_entrypoints: boolean;
    json: boolean;
    dry_run: boolean;
  } = { list_entrypoints: false, json: false, dry_run: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const field = VALUE_FLAGS[token];
    if (field !== undefined) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) return { error: `missing value for ${token}` };
      raw[field] = value;
      i++;
    } else if (token === "--list-entrypoints") {
      raw.list_entrypoints = true;
    } else if (token === "--json") {
      raw.json = true;
    } else if (token === "--dry-run") {
      raw.dry_run = true;
    } else {
      return { error: `unknown argument: ${token}` };
    }
  }
  const mode_flags = [raw.list_entrypoints, raw.apply_stitch !== undefined, raw.apply_descriptions !== undefined];
  if (mode_flags.filter(Boolean).length > 1) return { error: "at most one mode flag is allowed" };
  const mode: ReconcileMode = raw.list_entrypoints
    ? "list_entrypoints"
    : raw.apply_stitch !== undefined
      ? "apply_stitch"
      : raw.apply_descriptions !== undefined
        ? "apply_descriptions"
        : "default";

  if (raw.store === undefined) return { error: "missing required --store" };
  if (raw.repo_root === undefined) return { error: "missing required --repo-root" };
  const needs_files = mode === "default" || mode === "list_entrypoints";
  if (needs_files && raw.files_raw === undefined) return { error: "missing required --files" };
  const files = (raw.files_raw ?? "").split(",").map((p) => p.trim()).filter((p) => p.length > 0);
  return {
    args: {
      mode,
      files,
      store: raw.store,
      repo_root: raw.repo_root,
      json: raw.json,
      dry_run: raw.dry_run,
      goal: raw.goal,
      payload_path: raw.apply_stitch ?? raw.apply_descriptions,
      session_id: raw.session_id,
      session_cwd: raw.session_cwd,
      instruction: raw.instruction,
    },
  };
}

/** Read, JSON-parse, and contract-validate an `--apply-stitch` payload; a breach exits 2. */
function parse_stitch_payload(payload_path: string): Parameters<typeof apply_stitch>[1] {
  const parsed = parse_apply_stitch(read_payload(payload_path));
  if ("error" in parsed) {
    process.stderr.write(`drift-reconcile: invalid --apply-stitch payload: ${parsed.error}\n`);
    process.exit(2);
  }
  return parsed.input;
}

/** Read, JSON-parse, and contract-validate an `--apply-descriptions` payload; a breach exits 2. */
function parse_descriptions_payload(payload_path: string): Parameters<typeof apply_descriptions>[1] {
  const parsed = parse_apply_descriptions(read_payload(payload_path));
  if ("error" in parsed) {
    process.stderr.write(`drift-reconcile: invalid --apply-descriptions payload: ${parsed.error}\n`);
    process.exit(2);
  }
  return parsed.input;
}

/** Read and JSON-parse a mode payload file; a contract breach exits 2. */
function read_payload(payload_path: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(payload_path, "utf8");
  } catch (error: unknown) {
    process.stderr.write(`drift-reconcile: cannot read ${payload_path}: ${String(error)}\n`);
    process.exit(2);
  }
  try {
    return JSON.parse(text);
  } catch (error: unknown) {
    process.stderr.write(`drift-reconcile: invalid JSON in ${payload_path}: ${String(error)}\n`);
    process.exit(2);
  }
}

function report_outcomes(result: ReconcileResult, file_count: number): void {
  for (const outcome of result.outcomes) {
    process.stderr.write(
      `drift-reconcile: ${outcome.action} ${outcome.flow_id} (${outcome.kind}, ${outcome.member_count} members)\n`,
    );
  }
  const retired = result.outcomes.filter((outcome) => outcome.action === "retire").length;
  const retired_note = retired > 0 ? ` (${retired} retired)` : "";
  const deferred_note =
    result.deferred_retirements.length > 0 ? `; deferred ${result.deferred_retirements.length} retirement(s)` : "";
  const deferred_skill_note =
    result.deferred_skill_syncs.length > 0 ? `; deferred ${result.deferred_skill_syncs.length} skill sync(s)` : "";
  process.stderr.write(
    `drift-reconcile: reconciled ${result.outcomes.length} flow(s)${retired_note} over ${file_count} file(s)${deferred_note}${deferred_skill_note}\n`,
  );
}

/**
 * Sync-status target for the fatal catch, which fires outside `main`'s scope after the store is
 * closed and the lock released. Unset until args parse; never set for --dry-run (which must leave
 * no trace on disk). `success_recorded` stops a post-success teardown failure (a throwing
 * store.close()) from stamping last_error over a run whose mutation durably completed.
 */
let status_target: { store: string; success_recorded: boolean } | undefined;

const now = (): string => new Date().toISOString();

async function main(): Promise<void> {
  const parsed = parse_args(process.argv.slice(2));
  if ("error" in parsed) {
    process.stderr.write(`drift-reconcile: ${parsed.error}\n${USAGE}\n`);
    process.exit(2);
  }
  const { args } = parsed;
  if (!args.dry_run) status_target = { store: args.store, success_recorded: false };

  // Every stderr diagnostic is also collected into the turn's durable record — the run log exists
  // because these lines used to die with the session transcript.
  const diagnostics: string[] = [];
  const log = (message: string): void => {
    process.stderr.write(`drift-reconcile: ${message}\n`);
    diagnostics.push(message);
  };
  // One id per invocation: every mode writes exactly one record, so the record IS the run.
  const run_id = make_run_id(now());
  const finish_run = (detail: Omit<ReconcileRunDetail, "mode" | "diagnostics">): void => {
    if (args.dry_run) return;
    const session_id = args.session_id ?? null;
    const record: ReconcileRunRecord = {
      schema_version: RECONCILE_RECORD_SCHEMA_VERSION,
      run_id,
      session_id,
      instruction: args.instruction ?? null,
      timestamp: now(),
      detail: { mode: args.mode, diagnostics, ...detail },
    };
    // Omitted, not null, and only when BOTH halves of the join key are known — the derivation
    // needs session_id and the session cwd (the pinned contract in
    // docs/contracts/reconcile_run_record.md; a partial key is its path_not_recorded case).
    if (session_id !== null && args.session_cwd !== undefined) {
      record.transcript_path = derive_transcript_path(args.session_cwd, session_id);
    }
    append_reconcile_log(args.store, record, log);
    // A success clears last_error: the status answers "is the NEWEST attempt accounted for?", so a
    // healed repo must not keep reading as failed.
    update_sync_status(args.store, { last_success_at: now(), last_error: null }, log);
    if (status_target !== undefined) status_target.success_recorded = true;
  };

  if ((args.mode === "default" || args.mode === "list_entrypoints") && args.files.length === 0) {
    if (args.mode === "list_entrypoints") process.stdout.write(JSON.stringify({ entrypoints: [] }) + "\n");
    else if (args.json) process.stdout.write("[]\n");
    log("empty file set, no-op");
    if (!args.dry_run) update_sync_status(args.store, { last_attempt_at: now() }, log);
    finish_run({
      file_set: [],
      outcomes: [],
      deferred_retirements: [],
      deferred_skill_syncs: [],
      description_counts: zero_counts(),
    });
    return;
  }

  // Payload contract errors exit 2 here, before the lock exists, so no exit path inside the
  // lock-held region below can bypass release.
  const stitch_input = args.mode === "apply_stitch" ? parse_stitch_payload(args.payload_path!) : undefined;
  const descriptions_input =
    args.mode === "apply_descriptions" ? parse_descriptions_payload(args.payload_path!) : undefined;

  // Every non-dry-run mode mutates the store (list_entrypoints runs the full deterministic
  // reconcile before its inventory read), so every one holds the mutex. --dry-run opens the
  // connection itself read-only below, so it neither needs the mutex nor should be blocked by one.
  let lock: ReconcileLock | undefined;
  if (!args.dry_run) {
    // Stamped before any work: a run killed mid-flight leaves attempt > success with no error,
    // which is what makes a dropped reconcile distinguishable from nothing-changed.
    update_sync_status(args.store, { last_attempt_at: now() }, log);
    const acquired = await acquire_reconcile_lock(args.store, { wait_ms: lock_wait_ms() });
    if (acquired === null) {
      process.stderr.write(
        "drift-reconcile: another reconcile is running (drift_reconcile.lock held); exiting without touching the store\n",
      );
      update_sync_status(
        args.store,
        { last_error: { at: now(), message: "reconcile contention: another reconcile holds the lock" } },
        log,
      );
      process.exit(1);
    }
    lock = acquired;
  }

  const store = open_reconcile_store(args, lock);
  try {
    const project = new HeadlessProject(args.repo_root);
    await project.initialize();
    const adapter = make_ariadne_adapter(project, log);

    const deps: ReconcileDeps = {
      store: args.dry_run ? dry_run_store(store) : store,
      adapter,
      repo_root_abs: args.repo_root,
      analyzed_root: "",
      goal: args.goal,
      now: () => new Date().toISOString(),
      log,
    };

    switch (args.mode) {
      case "default": {
        const result = await reconcile(args.files, deps);
        if (args.json) process.stdout.write(JSON.stringify(result.outcomes) + "\n");
        report_outcomes(result, args.files.length);
        finish_run(turn_record(result));
        return;
      }
      case "list_entrypoints": {
        // The same deterministic reconcile as the default mode — resync, retire, and singleton
        // hydration all ride this pass — followed by the inventory read the agent judges from.
        const result = await reconcile(args.files, deps);
        report_outcomes(result, args.files.length);
        const changed = args.files.map((f) => to_repo_relative(f, args.repo_root));
        const inventory = build_entrypoint_inventory(deps, changed, adapter.call_graph());
        process.stdout.write(JSON.stringify(inventory) + "\n");
        finish_run(turn_record(result));
        return;
      }
      case "apply_stitch": {
        // Same turn atomicity as reconcile(): the stitch applies umbrellas AND retires absorbed
        // singletons across many writes, so a mid-turn crash must roll the whole apply back.
        const result = await deps.store.transaction(() => apply_stitch(deps, stitch_input!, adapter.call_graph()));
        // The stdout wire is the agent's phase-2 input ({ flows }); the describe tally is
        // log-internal and rides only the run record.
        process.stdout.write(JSON.stringify({ flows: result.flows }) + "\n");
        log(`applied ${result.flows.length} umbrella(s) from ${stitch_input!.umbrellas.length} proposed`);
        finish_run({
          file_set: [],
          outcomes: [],
          deferred_retirements: [],
          deferred_skill_syncs: [],
          description_counts: result.description_counts,
        });
        return;
      }
      case "apply_descriptions": {
        // One transaction over the whole description batch, so a mid-batch crash leaves none of the
        // agent's descriptions half-written.
        const result = await deps.store.transaction(async () =>
          apply_descriptions(deps, descriptions_input!, adapter.call_graph()),
        );
        process.stdout.write(JSON.stringify(result) + "\n");
        log(`wrote ${result.written.length} description(s), skipped ${result.skipped.length}`);
        finish_run({
          file_set: [],
          outcomes: [],
          deferred_retirements: [],
          deferred_skill_syncs: [],
          // Agent-authored text is the one source of llm-bucket descriptions.
          description_counts: { docstring: 0, provisional: 0, placeholder: 0, llm: result.written.length },
        });
        return;
      }
    }
  } finally {
    try {
      store.close();
    } finally {
      lock?.release();
    }
  }
}

function zero_counts(): DescriptionCounts {
  return { docstring: 0, provisional: 0, placeholder: 0, llm: 0 };
}

/** The reconcile-bearing modes' run-record fields, straight off the engine result. */
function turn_record(result: ReconcileResult): Omit<ReconcileRunDetail, "mode" | "diagnostics"> {
  return {
    file_set: result.file_set,
    outcomes: result.outcomes,
    deferred_retirements: result.deferred_retirements,
    deferred_skill_syncs: result.deferred_skill_syncs,
    description_counts: result.description_counts,
  };
}

/**
 * Open the store for the run. Dry-run must be dry at the CONNECTION level, not just via the
 * write-swallowing wrapper: a read-write open would run schema init (a write), flip the journal
 * mode, and create the db file on a cold repo — a cold repo gets the empty degraded store instead.
 * An open failure releases the mutex before propagating, so a throwing constructor cannot leak it.
 */
function open_reconcile_store(args: Args, lock: ReconcileLock | undefined): GraphStore {
  try {
    if (!args.dry_run) return open_graph_store(args.store);
    return fs.existsSync(args.store) ? open_graph_store(args.store, { read_only: true }) : new NullGraphStore();
  } catch (err) {
    lock?.release();
    throw err;
  }
}

/**
 * The bounded lock wait — undefined defers to acquire_reconcile_lock's default, keeping one source
 * of truth. The env override is a test seam: bin tests hold the lock and need a sub-second wait.
 */
function lock_wait_ms(): number | undefined {
  const raw = process.env.DRIFT_RECONCILE_LOCK_WAIT_MS;
  if (raw === undefined || raw === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

main().catch((error: unknown) => {
  process.stderr.write(`drift-reconcile: fatal: ${String(error)}\n`);
  // The durable last-error record (the store is closed and the lock released by now, which is why
  // the status lives in a sidecar). Best-effort inside update_sync_status — it can never mask the
  // fatal exit code. Skipped once success was recorded: a throwing store.close() after a durable
  // commit is a teardown failure, not a failed reconcile.
  if (status_target !== undefined && !status_target.success_recorded) {
    update_sync_status(
      status_target.store,
      { last_error: { at: now(), message: String(error) } },
      (message) => process.stderr.write(`drift-reconcile: ${message}\n`),
    );
  }
  process.exit(1);
});
