/**
 * The durable reconcile record: two sidecar files beside the store, because the answers they hold
 * must survive the process that produced them (stderr dies with the session transcript) and must be
 * writable when the store itself cannot be — the fatal path fires after `store.close()`, and the
 * garbage-db path fires before the store ever opened.
 *
 *  - `drift_reconcile_log.jsonl` — append-only, one {@link ReconcileLogRecord} line per COMPLETED
 *    turn (a failed or contended run leaves no line here; the status file is the record of those).
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

import * as fs from "node:fs";
import * as path from "node:path";

import type { DeferredRetirement, DescriptionCounts, FlowOutcome } from "./types";

const LOG_FILE = "drift_reconcile_log.jsonl";
const STATUS_FILE = "drift_reconcile_status.json";

/** The bin's dispatch mode a record was written under. */
export type ReconcileMode = "default" | "list_entrypoints" | "apply_stitch" | "apply_descriptions";

/** One turn's durable record — a single JSONL line. */
export interface ReconcileLogRecord {
  timestamp: string;
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
  description_counts: DescriptionCounts;
  /** Every diagnostic the run emitted to stderr — hydration-cap notices, stitch skips, join misses. */
  diagnostics: readonly string[];
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

/** Append one turn record as a single JSONL line. Best-effort — an IO failure only logs. */
export function append_reconcile_log(
  store_path: string,
  record: ReconcileLogRecord,
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
