/**
 * The grading queue's pure half: selection, verdict-line parsing, and screenful composition. IO
 * (readline, grade writes, spine extraction) stays in the drift-inspect bin so every decision
 * here is testable over in-memory values.
 *
 * The spine block of a screenful is `render_trajectory` verbatim — the neutral surface pinned by
 * docs/contracts/trajectory_spine.md. The changed-file-set header and the flow summary read the
 * run record directly: they are drift context the queue owns; only the SPINE rendering is bound
 * to neutrality ("the grading queue renders any neutral-schema spine").
 */

import type { ReconcileRunRecord } from "../reconcile/reconcile_log";
import type { GradeVerdict, RunGradeRecord } from "../reconcile/grade_log";
import type { TrajectorySpine } from "./trajectory_schema";
import { render_trajectory } from "./trajectory_render";

/** Records newest-first minus already-graded — the resumable queue. */
export function select_ungraded(
  records: readonly ReconcileRunRecord[],
  grades: ReadonlyMap<string, RunGradeRecord>,
): ReconcileRunRecord[] {
  return records.filter((record) => !grades.has(record.run_id));
}

export type GradeInput =
  | { kind: "verdict"; verdict: GradeVerdict; reason: string }
  | { kind: "skip" }
  | { kind: "quit" }
  | { kind: "invalid"; note: string };

const VERDICT_TOKENS: ReadonlyMap<string, GradeVerdict> = new Map([
  ["g", "good"],
  ["good", "good"],
  ["b", "bad"],
  ["bad", "bad"],
  ["m", "mixed"],
  ["mixed", "mixed"],
]);

/** One line per run: `<verdict> <reason...>`; `s`/`skip` defers, `q`/`quit` ends the session. */
export function parse_grade_line(line: string): GradeInput {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed === "s" || trimmed === "skip") return { kind: "skip" };
  if (trimmed === "q" || trimmed === "quit") return { kind: "quit" };
  const separator = trimmed.search(/\s/);
  const token = (separator === -1 ? trimmed : trimmed.slice(0, separator)).toLowerCase();
  const verdict = VERDICT_TOKENS.get(token);
  if (verdict === undefined) return { kind: "invalid", note: `unknown verdict "${token}"` };
  const reason = separator === -1 ? "" : trimmed.slice(separator + 1).trim();
  if (reason.length === 0) return { kind: "invalid", note: "a verdict needs a one-line reason" };
  return { kind: "verdict", verdict, reason };
}

/** The compact flow summary: one line per outcome, grouped counts in the header. */
export function summarize_outcomes(record: ReconcileRunRecord): string[] {
  const outcomes = record.detail.outcomes ?? [];
  if (outcomes.length === 0) return ["flows: none touched"];
  const by_action = new Map<string, number>();
  for (const outcome of outcomes) by_action.set(outcome.action, (by_action.get(outcome.action) ?? 0) + 1);
  const header = [...by_action.entries()].map(([action, count]) => `${action} ${count}`).join(", ");
  return [
    `flows (${header}):`,
    ...outcomes.map(
      (outcome) => `  ${outcome.action} ${outcome.flow_id} -> ${outcome.member_count} member(s): ${outcome.reason}`,
    ),
  ];
}

/** One screenful: changed files, the neutral spine render, the flow summary. */
export function render_grading_screen(record: ReconcileRunRecord, spine: TrajectorySpine): string[] {
  const file_set = record.detail.file_set ?? [];
  return [
    `run ${record.run_id}`,
    `changed files (${file_set.length}): ${file_set.join(", ")}`,
    "",
    ...render_trajectory(spine),
    "",
    ...summarize_outcomes(record),
  ];
}
