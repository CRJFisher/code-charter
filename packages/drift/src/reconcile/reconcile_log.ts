/**
 * The durable reconcile record: two sidecar files beside the store, because the answers they hold
 * must survive the process that produced them (stderr dies with the session transcript) and must be
 * writable when the store itself cannot be — the fatal path fires after `store.close()`, and the
 * garbage-db path fires before the store ever opened.
 *
 *  - `drift_reconcile_log.jsonl` — append-only, one {@link ReconcileRunRecord} line per COMPLETED
 *    run (a failed or contended run leaves no line here; the status file is the record of those).
 *    The line format is the pinned contract in docs/contracts/reconcile_run_record.md.
 *    Store-mutating turns append while holding the reconcile mutex; the empty-file-set no-op
 *    appends without it and relies on single-`appendFileSync` O_APPEND atomicity for its small line.
 *  - `drift_reconcile_status.json` — a single {@link SyncStatus} object, rewritten via temp + rename
 *    (a reader never sees a torn file) with a read-merge-write so the fields a run does not set
 *    survive. The merge is NOT lost-update-safe across two racing processes (the attempt stamp and
 *    the contention/fatal error stamps fire outside the mutex); the status is a best-effort,
 *    last-writer-wins health snapshot, not a ledger. `last_attempt_at` is stamped BEFORE the work
 *    starts: a run killed mid-flight leaves attempt > success with no error — distinguishable from
 *    both "nothing changed" (attempt <= success) and a recorded failure (last_error set).
 *
 * Every write is best-effort: the record must never turn a healthy reconcile into a failure, so IO
 * errors degrade to a `log` diagnostic and are swallowed. The log grows without bound — accepted:
 * one line per turn, disposable beside the store (delete it with the db).
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import type { DeferredRetirement, DeferredSkillSync, DescriptionCounts, FlowOutcome } from "./types";

const LOG_FILE = "drift_reconcile_log.jsonl";
const STATUS_FILE = "drift_reconcile_status.json";

/**
 * Pinned by docs/contracts/reconcile_run_record.md. Readers skip lines of any other version
 * (including pre-contract flat lines, which carry none) — the log is disposable, never migrated.
 */
export const RECONCILE_RECORD_SCHEMA_VERSION = 1;

/** The bin's dispatch mode a record was written under. */
export type ReconcileMode = "default" | "list_entrypoints" | "apply_stitch" | "apply_descriptions";

/**
 * One run's durable record — a single JSONL line. Mechanism-agnostic keys at the top level,
 * every drift-specific field under `detail` (decision-10; the split is what lifts to a shared
 * toolkit if a third consumer of the run→trajectory→grade shape ever appears).
 */
export interface ReconcileRunRecord {
  schema_version: number;
  run_id: string;
  /** The Claude session whose Stop fire launched this run; null for hand-invoked runs. */
  session_id: string | null;
  /** Omitted (not null) when session_id is null — there is no transcript to point at. */
  transcript_path?: string;
  /** The verbatim instruction the Stop hook issued; null for hand-invoked runs. */
  instruction: string | null;
  timestamp: string;
  detail: ReconcileRunDetail;
}

/** The drift payload of one run record. */
export interface ReconcileRunDetail {
  mode: ReconcileMode;
  /**
   * The normalized (repo-relative, deduped, sorted) changed set for the reconcile-bearing modes;
   * always empty for the apply modes. "Which file set drove the last sync?" = the file_set of the
   * newest record whose mode is default | list_entrypoints.
   */
  file_set: readonly string[];
  outcomes: readonly FlowOutcome[];
  /**
   * Retirements the graph-health guard skipped this turn. Whether one ever completed is answered
   * across turns: a later record carrying a retire (or re-hydrate) outcome for the same flow_id.
   */
  deferred_retirements: readonly DeferredRetirement[];
  /**
   * Skill re-syncs the partial-write guard skipped this turn because the bundle looked degraded on
   * disk. Like `deferred_retirements`, completion is answered across turns by a later record carrying
   * a hydrate/resync outcome for the same flow_id.
   */
  deferred_skill_syncs: readonly DeferredSkillSync[];
  description_counts: DescriptionCounts;
  /** Every diagnostic the run emitted to stderr — hydration-cap notices, stitch skips, join misses. */
  diagnostics: readonly string[];
}

/**
 * A fixed-width compact-ISO prefix makes lexicographic order chronological (newest-first grading
 * and `--trajectory latest` need no timestamp parse); the random suffix carries uniqueness.
 */
export function make_run_id(timestamp_iso: string): string {
  return `${timestamp_iso.replace(/[-:.]/g, "")}-${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * The rolling health record: is the newest reconcile attempt accounted for? `last_error` describes
 * the newest FAILED attempt and is cleared by the next success, so `last_error !== null` always
 * means the repo's most recent outcome was a failure.
 */
export interface SyncStatus {
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: { at: string; message: string } | null;
}

export function reconcile_log_path(store_path: string): string {
  return path.join(path.dirname(store_path), LOG_FILE);
}

export function sync_status_path(store_path: string): string {
  return path.join(path.dirname(store_path), STATUS_FILE);
}

/** Append one run record as a single JSONL line. Best-effort — an IO failure only logs. */
export function append_reconcile_log(
  store_path: string,
  record: ReconcileRunRecord,
  log: (message: string) => void,
): void {
  const log_path = reconcile_log_path(store_path);
  try {
    fs.mkdirSync(path.dirname(log_path), { recursive: true });
    fs.appendFileSync(log_path, JSON.stringify(record) + "\n");
  } catch (error) {
    log(`could not append to ${LOG_FILE}: ${String(error)}`);
  }
}

/**
 * Read the newest current-schema record from the append-only log, or null when the log is absent
 * or holds none. Reads the whole file and scans backwards — the log is one small line per turn and
 * disposable beside the store, so a full read is cheap. Torn lines and foreign-schema lines
 * (pre-contract flat records carry no schema_version) are skipped, never migrated.
 */
export function read_latest_reconcile_record(store_path: string): ReconcileRunRecord | null {
  let raw: string;
  try {
    raw = fs.readFileSync(reconcile_log_path(store_path), "utf8");
  } catch {
    return null;
  }
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed: unknown = JSON.parse(lines[i]);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        (parsed as { schema_version?: unknown }).schema_version === RECONCILE_RECORD_SCHEMA_VERSION
      ) {
        return parsed as ReconcileRunRecord;
      }
    } catch {
      // skip a torn line and try the previous one
    }
  }
  return null;
}

/** Read the current status; a missing or unparsable file is the empty status. */
export function read_sync_status(store_path: string): SyncStatus {
  try {
    const raw = fs.readFileSync(sync_status_path(store_path), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) return { ...empty_status(), ...parsed };
  } catch {
    // fall through to the empty status
  }
  return empty_status();
}

/**
 * Merge `patch` onto the persisted status and rewrite it atomically (temp + rename), so a
 * concurrent reader never sees a torn file and the fields this run does not set survive.
 * Best-effort — an IO failure only logs.
 */
export function update_sync_status(
  store_path: string,
  patch: Partial<SyncStatus>,
  log: (message: string) => void,
): void {
  const status_path = sync_status_path(store_path);
  const tmp_path = `${status_path}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(status_path), { recursive: true });
    const merged: SyncStatus = { ...read_sync_status(store_path), ...patch };
    fs.writeFileSync(tmp_path, JSON.stringify(merged) + "\n");
    fs.renameSync(tmp_path, status_path);
  } catch (error) {
    log(`could not update ${STATUS_FILE}: ${String(error)}`);
  } finally {
    try {
      fs.rmSync(tmp_path, { force: true });
    } catch {
      // force only covers ENOENT; an unreachable tmp path (ENOTDIR, EROFS) is equally fine to leave
    }
  }
}

function empty_status(): SyncStatus {
  return { last_attempt_at: null, last_success_at: null, last_error: null };
}
