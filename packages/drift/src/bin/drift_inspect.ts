#!/usr/bin/env node
/**
 * The `drift-inspect` bin — the first-party way to answer "did my last sync do what I expected?".
 *
 * It opens the graph store read-only (never competing for the write lock, never running schema init)
 * and folds in the durable run log from the store's sidecars (reconcile_log.ts): the newest turn's
 * deferred retirements and the last-attempt/success/error health rollup. Four read-only views:
 *  - default — the whole-store summary: live/retired flow counts, per-flow members + seeds, the
 *    description-source split, and every persisted bridge with its rationale.
 *  - `--flow <id>` — drill into one flow: its seeds, each member's description, and the bridges it
 *    touches.
 *  - `--lint` — anomaly detection: flows with 0 members, a stitch proposal whose declared bridges
 *    were not persisted, and a store dominated by placeholder descriptions.
 *  - `--trajectory <run-id|latest>` — the salient spine of one reconcile run (instruction →
 *    context → judgement → effect, docs/contracts/trajectory_spine.md), joined to the session
 *    transcript via the run record's join key; a missing transcript degrades to an effect-only
 *    view, never an error.
 *
 * Plus one interactive mode: `--grade` (and the targeted `--regrade <run-id>`) walks the ungraded
 * runs newest-first, one screenful each, and records verdicts to the drift_run_grades.jsonl
 * register (docs/contracts/run_grade_record.md) — the one mode that writes beside the store.
 *
 * `--json` emits the projection as JSON instead of text (the same structure the collectors return).
 * A store that was never reconciled (no db file) is the empty summary, not an error. Exit 0 = clean
 * (including a degraded trajectory), 1 = `--lint` found anomalies or `--flow`/`--trajectory` named
 * an unknown flow/run, 2 = usage error.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

import {
  collect_flow_detail,
  collect_store_summary,
  count_proposed_bridges,
  detect_anomalies,
} from "../inspect/summary";
import { read_inspect_input } from "../inspect/read_input";
import { render_anomalies, render_flow_detail, render_summary } from "../inspect/render";
import { extract_trajectory_spine } from "../inspect/trajectory_extract";
import { render_trajectory } from "../inspect/trajectory_render";
import { parse_grade_line, render_grading_screen, select_ungraded } from "../inspect/grade_queue";
import {
  read_latest_reconcile_record,
  read_reconcile_record_by_run_id,
  read_reconcile_records_newest_first,
  type ReconcileRunRecord,
} from "../reconcile/reconcile_log";
import { read_grades, upsert_grade, GRADE_RECORD_SCHEMA_VERSION } from "../reconcile/grade_log";

const USAGE =
  "usage: drift-inspect --store <db_path> [--json] [--flow <id>] [--lint] [--trajectory <run-id|latest>] [--grade | --regrade <run-id>]";

interface Args {
  store: string;
  json: boolean;
  flow: string | undefined;
  lint: boolean;
  trajectory: string | undefined;
  grade: boolean;
  regrade: string | undefined;
}

function parse_args(argv: readonly string[]): { args: Args } | { error: string } {
  const raw: {
    store?: string;
    flow?: string;
    trajectory?: string;
    regrade?: string;
    json: boolean;
    lint: boolean;
    grade: boolean;
  } = { json: false, lint: false, grade: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--store" || token === "--flow" || token === "--trajectory" || token === "--regrade") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) return { error: `missing value for ${token}` };
      if (token === "--store") raw.store = value;
      else if (token === "--flow") raw.flow = value;
      else if (token === "--trajectory") raw.trajectory = value;
      else raw.regrade = value;
      i++;
    } else if (token === "--json") {
      raw.json = true;
    } else if (token === "--lint") {
      raw.lint = true;
    } else if (token === "--grade") {
      raw.grade = true;
    } else {
      return { error: `unknown argument: ${token}` };
    }
  }
  if (raw.store === undefined) return { error: "missing required --store" };
  if (raw.flow !== undefined && raw.lint) return { error: "--flow and --lint are mutually exclusive" };
  if (raw.trajectory !== undefined && (raw.flow !== undefined || raw.lint)) {
    return { error: "--trajectory is mutually exclusive with --flow and --lint" };
  }
  const grading = raw.grade || raw.regrade !== undefined;
  if (grading && (raw.flow !== undefined || raw.lint || raw.trajectory !== undefined)) {
    return { error: "--grade/--regrade are mutually exclusive with --flow, --lint, and --trajectory" };
  }
  if (raw.grade && raw.regrade !== undefined) return { error: "--grade and --regrade are mutually exclusive" };
  return {
    args: {
      store: raw.store,
      json: raw.json,
      flow: raw.flow,
      lint: raw.lint,
      trajectory: raw.trajectory,
      grade: raw.grade,
      regrade: raw.regrade,
    },
  };
}

/** The stitch proposal sidecar beside the store, or null when absent/unreadable. */
function read_stitch_json(store_path: string): string | null {
  try {
    return fs.readFileSync(path.join(path.dirname(store_path), "stitch.json"), "utf8");
  } catch {
    return null;
  }
}

function emit(json: boolean, projection: unknown, lines: string[]): void {
  process.stdout.write(json ? JSON.stringify(projection, null, 2) + "\n" : lines.join("\n") + "\n");
}

/**
 * The interactive grading session: one screenful per queued run, one stdin line per verdict.
 * Each accepted verdict is persisted before the next screen, so quit/EOF/crash keeps every
 * committed grade and the next session resumes over the remaining ungraded runs. Piped stdin
 * drives it identically to a TTY (readline emits line/close for both); an invalid line skips
 * with a stderr note instead of re-prompting, so a scripted session can never hang.
 */
async function run_grading_session(store: string, queue: readonly ReconcileRunRecord[]): Promise<number> {
  if (queue.length === 0) {
    process.stdout.write("drift-inspect: no ungraded runs\n");
    return 0;
  }
  const rl = readline.createInterface({ input: process.stdin });
  const lines = rl[Symbol.asyncIterator]();
  try {
    for (const record of queue) {
      const spine = extract_trajectory_spine(store, record);
      process.stdout.write(render_grading_screen(record, spine).join("\n") + "\n");
      process.stdout.write("grade [good|bad|mixed] <reason>  (s=skip, q=quit) > ");
      const next = await lines.next();
      if (next.done === true) return 0; // EOF — committed grades persist, the rest stay queued
      const input = parse_grade_line(next.value);
      if (input.kind === "quit") return 0;
      if (input.kind === "skip") continue;
      if (input.kind === "invalid") {
        process.stderr.write(`drift-inspect: ${input.note} — run left ungraded\n`);
        continue;
      }
      upsert_grade(store, {
        schema_version: GRADE_RECORD_SCHEMA_VERSION,
        run_id: record.run_id,
        verdict: input.verdict,
        reason: input.reason,
        graded_at: new Date().toISOString(),
        detail: {
          mode: record.detail.mode,
          file_set: record.detail.file_set ?? [],
          transcript_available: spine.transcript_available,
        },
      });
      process.stdout.write(`graded ${record.run_id}: ${input.verdict}\n`);
    }
    return 0;
  } finally {
    rl.close();
  }
}

function main(): void {
  const parsed = parse_args(process.argv.slice(2));
  if ("error" in parsed) {
    process.stderr.write(`drift-inspect: ${parsed.error}\n${USAGE}\n`);
    process.exit(2);
  }
  const { args } = parsed;

  if (args.grade || args.regrade !== undefined) {
    let queue: ReconcileRunRecord[];
    if (args.regrade !== undefined) {
      const record = read_reconcile_record_by_run_id(args.store, args.regrade);
      if (record === null) {
        process.stderr.write(`drift-inspect: no reconcile run for "${args.regrade}"\n`);
        process.exit(1);
      }
      queue = [record];
    } else {
      queue = select_ungraded(read_reconcile_records_newest_first(args.store), read_grades(args.store));
    }
    // exitCode, not exit(): a hard exit can truncate piped stdout mid-flush; with readline closed
    // the event loop drains and the process ends naturally.
    void run_grading_session(args.store, queue).then(
      (code) => {
        process.exitCode = code;
      },
      (error: unknown) => {
        process.stderr.write(`drift-inspect: grading failed: ${String(error)}\n`);
        process.exitCode = 1;
      },
    );
    return;
  }

  if (args.trajectory !== undefined) {
    const record =
      args.trajectory === "latest"
        ? read_latest_reconcile_record(args.store)
        : read_reconcile_record_by_run_id(args.store, args.trajectory);
    if (record === null) {
      process.stderr.write(`drift-inspect: no reconcile run for "${args.trajectory}"\n`);
      process.exit(1);
    }
    const spine = extract_trajectory_spine(args.store, record);
    // A degraded (effect-only) spine is a successful view, never an error — the transcript is
    // disposable host state; the record is the durable one.
    emit(args.json, spine, render_trajectory(spine));
    return;
  }

  const input = read_inspect_input(args.store);
  const summary = collect_store_summary(input);

  if (args.flow !== undefined) {
    const detail = collect_flow_detail(input, args.flow);
    if (detail === undefined) {
      process.stderr.write(`drift-inspect: no flow with id "${args.flow}"\n`);
      process.exit(1);
    }
    emit(args.json, detail, render_flow_detail(detail));
    return;
  }

  if (args.lint) {
    const anomalies = detect_anomalies(summary, count_proposed_bridges(read_stitch_json(args.store)));
    emit(args.json, anomalies, render_anomalies(anomalies));
    if (anomalies.length > 0) process.exit(1);
    return;
  }

  emit(args.json, summary, render_summary(summary));
}

main();
