/**
 * The per-turn watermark that makes the `Stop` hook satisfiable.
 *
 * The hook decides from the session transcript, which is append-only — so without a cursor,
 * {@link parse_worked_on_files} returns every file edited all session and the hook re-fires that whole
 * list every turn, with no action able to clear it (reconciliation writes the store, never the
 * transcript). The watermark records how many transcript lines a prior fire already handed off, so each
 * fire considers only edits in *newer* lines — the genuine "this turn" set — and advances the cursor to
 * the current end. Once a turn's edits are dispatched to the reconciler, later turns with no new edits
 * no-op. The cursor file is kept per session (concurrent sessions in one repo must not thrash each
 * other's cursor); the `transcript_path` field guards rotation within a session — a different
 * transcript under the same session id resets the cursor to 0.
 *
 * The cursor advances only once the turn is durably accounted for — its edits staged atomically in the
 * pending file, or legitimately nothing to stage — so a turn is never reconciled twice and a failed
 * stage re-fires the same edits next turn. A declined or failed reconcile is still not lost: the
 * staged pending set unions across fires until consumed.
 */

import { parse_worked_on_files } from "./transcript_parser";

/**
 * The filename stem every per-session watermark carries: `${WATERMARK_FILE_PREFIX}.${session_id}.json`.
 * Owned here beside the watermark semantics so the bin that writes the files and the GC that prunes
 * them recognise the same set.
 */
export const WATERMARK_FILE_PREFIX = "drift_stop_watermark";

/** A directory entry the GC weighs: a filename and its last-modified time in epoch ms. */
export interface WatermarkFileEntry {
  name: string;
  mtime_ms: number;
}

/**
 * The watermark files to delete: one cursor accrues per session (a session id never recurs), so a
 * long-lived repo accumulates dead cursors from every past session. A cursor older than `max_age_ms`
 * belongs to a session that ended days ago — no live session's cursor is ever that stale — so it is
 * safe to drop; its only effect if a matching session somehow resumed would be to re-fire that
 * session's edits once. Non-watermark entries and fresh cursors are left untouched. Pure.
 */
export function select_stale_watermarks(
  entries: readonly WatermarkFileEntry[],
  now_ms: number,
  max_age_ms: number,
): string[] {
  return entries
    .filter(
      (entry) =>
        entry.name.startsWith(`${WATERMARK_FILE_PREFIX}.`) &&
        entry.name.endsWith(".json") &&
        now_ms - entry.mtime_ms > max_age_ms,
    )
    .map((entry) => entry.name);
}

export interface StopWatermark {
  /** The transcript this cursor applies to; a different one is a new session and resets the count. */
  transcript_path: string;
  /** Transcript lines already processed by a prior Stop fire. */
  lines_processed: number;
}

export interface WorkedOnSinceResult {
  /** Files edited in transcript lines beyond the cursor — this turn's drift. */
  worked_on: string[];
  /** The advanced cursor to persist (covers every line seen now). */
  next: StopWatermark;
}

/** The files edited since the previous Stop fire, plus the advanced cursor. Pure. */
export function worked_on_since(
  transcript_text: string,
  transcript_path: string,
  prev: StopWatermark | null,
): WorkedOnSinceResult {
  // JSONL records are newline-terminated; drop the trailing empty element so the count is the number of
  // real records (a stray trailing "" would inflate the cursor by one and skip the next appended edit).
  const body = transcript_text.endsWith("\n") ? transcript_text.slice(0, -1) : transcript_text;
  const lines = body.length === 0 ? [] : body.split("\n");
  const prior = prev !== null && prev.transcript_path === transcript_path ? prev.lines_processed : 0;
  // A compacted/truncated transcript (now shorter than the cursor) restarts from the beginning.
  const start = prior >= 0 && prior <= lines.length ? prior : 0;
  const worked_on = parse_worked_on_files(lines.slice(start).join("\n"));
  return { worked_on, next: { transcript_path, lines_processed: lines.length } };
}

/** Parse a persisted watermark, or null when absent/malformed (treated as a fresh cursor). */
export function parse_watermark(raw: string): StopWatermark | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).transcript_path === "string" &&
      typeof (parsed as Record<string, unknown>).lines_processed === "number"
    ) {
      const record = parsed as { transcript_path: string; lines_processed: number };
      return { transcript_path: record.transcript_path, lines_processed: record.lines_processed };
    }
  } catch {
    /* malformed → fresh cursor */
  }
  return null;
}

export function serialize_watermark(watermark: StopWatermark): string {
  return JSON.stringify(watermark);
}
