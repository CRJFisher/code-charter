/**
 * The run-grade register: `drift_run_grades.jsonl` beside the store, the pinned contract in
 * docs/contracts/run_grade_record.md. Unlike the append-only run log, this is a KEYED register —
 * exactly one line per graded run_id — because a grade is a current judgement, not an event: a
 * re-grade explicitly overwrites, never accumulates. Writes rewrite the whole file via temp +
 * atomic rename (the drift_reconcile_status.json precedent), which grading's single-writer
 * human-paced sessions make safe; each grade is flushed immediately, so an interrupted session
 * keeps every prior verdict and the queue resumes where it left off.
 *
 * This is deliberately a concrete sibling of reconcile_log.ts, not a shared JSONL helper: the
 * third JSONL consumer (the calibration script) is barred from importing drift modules by the
 * judge_calibration contract, so only two importers exist — below the rule-of-three bar.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { ReconcileMode } from "./reconcile_log";

const GRADES_FILE = "drift_run_grades.jsonl";

export const GRADE_RECORD_SCHEMA_VERSION = 1;

export type GradeVerdict = "good" | "bad" | "mixed";

const VERDICTS: ReadonlySet<string> = new Set(["good", "bad", "mixed"]);

export interface RunGradeDetail {
  mode: ReconcileMode;
  file_set: readonly string[];
  /** Whether the grader saw a full spine or an effect-only fallback. */
  transcript_available: boolean;
}

export interface RunGradeRecord {
  schema_version: number;
  run_id: string;
  verdict: GradeVerdict;
  reason: string;
  graded_at: string;
  detail: RunGradeDetail;
}

export function grades_path(store_path: string): string {
  return path.join(path.dirname(store_path), GRADES_FILE);
}

function is_current_grade(parsed: unknown): parsed is RunGradeRecord {
  if (typeof parsed !== "object" || parsed === null) return false;
  const record = parsed as Record<string, unknown>;
  return (
    record.schema_version === GRADE_RECORD_SCHEMA_VERSION &&
    typeof record.run_id === "string" &&
    typeof record.verdict === "string" &&
    VERDICTS.has(record.verdict) &&
    typeof record.reason === "string" &&
    typeof record.detail === "object" &&
    record.detail !== null
  );
}

/**
 * The effective grades, one per run_id. The writer guarantees uniqueness; the fold is last-wins
 * defense against a hand-appended duplicate. Torn and foreign lines are skipped, never migrated.
 */
export function read_grades(store_path: string): Map<string, RunGradeRecord> {
  const grades = new Map<string, RunGradeRecord>();
  let raw: string;
  try {
    raw = fs.readFileSync(grades_path(store_path), "utf8");
  } catch {
    return grades;
  }
  for (const line of raw.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (is_current_grade(parsed)) grades.set(parsed.run_id, parsed);
    } catch {
      // a torn line never poisons the register
    }
  }
  return grades;
}

/**
 * Upsert one grade: read the register, replace-or-add the run's line, rewrite atomically. Throws
 * on IO failure — a human just typed this verdict, so a swallowed write would silently discard
 * their judgement; the caller surfaces the failure and the run stays ungraded for a retry.
 */
export function upsert_grade(store_path: string, record: RunGradeRecord): void {
  const grades = read_grades(store_path);
  grades.set(record.run_id, record);
  const file_path = grades_path(store_path);
  fs.mkdirSync(path.dirname(file_path), { recursive: true });
  const tmp_path = `${file_path}.${process.pid}.tmp`;
  fs.writeFileSync(tmp_path, [...grades.values()].map((grade) => JSON.stringify(grade)).join("\n") + "\n");
  try {
    fs.renameSync(tmp_path, file_path);
  } catch (err) {
    fs.rmSync(tmp_path, { force: true });
    throw err;
  }
}
