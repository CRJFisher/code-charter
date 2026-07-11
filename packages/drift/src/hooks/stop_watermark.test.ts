import { describe, expect, it } from "@jest/globals";

import {
  parse_watermark,
  select_stale_watermarks,
  serialize_watermark,
  WATERMARK_FILE_PREFIX,
  worked_on_since,
} from "./stop_watermark";

/** Build a transcript JSONL line: one assistant message that edited `file_path`. */
function edit_line(file_path: string): string {
  return JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "Edit", input: { file_path } }] },
  });
}

/** A non-edit assistant/text line (advances line count without adding worked-on files). */
const NOISE_LINE = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "hi" }] } });

describe("worked_on_since (per-turn watermark)", () => {
  it("returns all edits and advances the cursor on a fresh watermark (first fire)", () => {
    const text = [edit_line("a.ts"), edit_line("b.ts")].join("\n");
    const { worked_on, next } = worked_on_since(text, "/t/session.jsonl", null);
    expect(worked_on).toEqual(["a.ts", "b.ts"]);
    expect(next).toEqual({ transcript_path: "/t/session.jsonl", lines_processed: 2 });
  });

  it("returns only edits beyond the cursor on a later fire (this turn only)", () => {
    const text = [edit_line("a.ts"), edit_line("b.ts"), edit_line("c.ts")].join("\n");
    const { worked_on, next } = worked_on_since(text, "/t/session.jsonl", {
      transcript_path: "/t/session.jsonl",
      lines_processed: 2,
    });
    expect(worked_on).toEqual(["c.ts"]); // a.ts/b.ts were already handed off
    expect(next.lines_processed).toBe(3);
  });

  it("no-ops an idle turn (no new edits beyond the cursor)", () => {
    const text = [edit_line("a.ts"), NOISE_LINE, NOISE_LINE].join("\n");
    const { worked_on } = worked_on_since(text, "/t/s.jsonl", { transcript_path: "/t/s.jsonl", lines_processed: 1 });
    expect(worked_on).toEqual([]);
  });

  it("resets to the start when the transcript_path differs (a new session)", () => {
    const text = [edit_line("a.ts"), edit_line("b.ts")].join("\n");
    const { worked_on } = worked_on_since(text, "/t/new.jsonl", { transcript_path: "/t/old.jsonl", lines_processed: 5 });
    expect(worked_on).toEqual(["a.ts", "b.ts"]);
  });

  it("restarts from the beginning when the transcript is shorter than the cursor (compaction)", () => {
    const text = [edit_line("a.ts")].join("\n");
    const { worked_on } = worked_on_since(text, "/t/s.jsonl", { transcript_path: "/t/s.jsonl", lines_processed: 99 });
    expect(worked_on).toEqual(["a.ts"]);
  });

  it("handles an empty transcript", () => {
    const { worked_on, next } = worked_on_since("", "/t/s.jsonl", null);
    expect(worked_on).toEqual([]);
    expect(next.lines_processed).toBe(0);
  });

  it("counts real records when the transcript ends with a newline (cursor not inflated)", () => {
    const text = `${[edit_line("a.ts"), edit_line("b.ts")].join("\n")}\n`;
    const { worked_on, next } = worked_on_since(text, "/t/s.jsonl", null);
    expect(worked_on).toEqual(["a.ts", "b.ts"]);
    expect(next.lines_processed).toBe(2);
  });

  it("sees a newly appended edit after a newline-terminated fire", () => {
    const first = `${edit_line("a.ts")}\n`;
    const { next } = worked_on_since(first, "/t/s.jsonl", null);
    const second = `${[edit_line("a.ts"), edit_line("b.ts")].join("\n")}\n`;
    const { worked_on } = worked_on_since(second, "/t/s.jsonl", next);
    expect(worked_on).toEqual(["b.ts"]);
  });
});

describe("parse_watermark / serialize_watermark", () => {
  it("round-trips", () => {
    const w = { transcript_path: "/t/s.jsonl", lines_processed: 7 };
    expect(parse_watermark(serialize_watermark(w))).toEqual(w);
  });
  it("returns null on malformed or partial input", () => {
    expect(parse_watermark("not json")).toBeNull();
    expect(parse_watermark(JSON.stringify({ transcript_path: "/t" }))).toBeNull();
    expect(parse_watermark(JSON.stringify({ lines_processed: 3 }))).toBeNull();
  });
});

describe("select_stale_watermarks (GC)", () => {
  const NOW = 1_000_000_000_000;
  const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  const wm = (session: string) => `${WATERMARK_FILE_PREFIX}.${session}.json`;

  it("drops only watermark files older than the max age", () => {
    const entries = [
      { name: wm("old"), mtime_ms: NOW - MAX_AGE - 1 },
      { name: wm("fresh"), mtime_ms: NOW - 1000 },
      { name: wm("exactly-at-boundary"), mtime_ms: NOW - MAX_AGE },
    ];
    expect(select_stale_watermarks(entries, NOW, MAX_AGE)).toEqual([wm("old")]);
  });

  it("never touches non-watermark siblings (the store, pending, log, status files)", () => {
    const entries = [
      { name: "graph.db", mtime_ms: 0 },
      { name: "drift_reconcile_log.jsonl", mtime_ms: 0 },
      { name: "drift_reconcile_status.json", mtime_ms: 0 },
      { name: "drift_pending_reconcile.json", mtime_ms: 0 },
    ];
    expect(select_stale_watermarks(entries, NOW, MAX_AGE)).toEqual([]);
  });

  it("returns an empty list when nothing is stale", () => {
    expect(select_stale_watermarks([{ name: wm("a"), mtime_ms: NOW }], NOW, MAX_AGE)).toEqual([]);
  });

  it("returns an empty list for an empty directory", () => {
    expect(select_stale_watermarks([], NOW, MAX_AGE)).toEqual([]);
  });

  it("leaves a stale prefix-matching sibling that is not a .json cursor", () => {
    const entries = [
      { name: `${WATERMARK_FILE_PREFIX}.old.json.tmp`, mtime_ms: NOW - MAX_AGE - 1 },
      { name: `${WATERMARK_FILE_PREFIX}.old.jsonl`, mtime_ms: NOW - MAX_AGE - 1 },
    ];
    expect(select_stale_watermarks(entries, NOW, MAX_AGE)).toEqual([]);
  });
});
