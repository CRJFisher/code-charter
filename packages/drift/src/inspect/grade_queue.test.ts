import { describe, expect, it } from "@jest/globals";

import type { ReconcileRunRecord } from "../reconcile/reconcile_log";
import type { RunGradeRecord } from "../reconcile/grade_log";
import { parse_grade_line, render_grading_screen, select_ungraded, summarize_outcomes } from "./grade_queue";
import { render_trajectory } from "./trajectory_render";
import type { TrajectorySpine } from "./trajectory_schema";

function record(run_id: string, over: Partial<ReconcileRunRecord> = {}): ReconcileRunRecord {
  return {
    schema_version: 1,
    run_id,
    session_id: "s1",
    instruction: "Launch the `drift-reconciler` sub-agent.",
    timestamp: "2026-07-10T12:00:30.000Z",
    detail: {
      mode: "default",
      file_set: ["src/a.ts", "src/b.ts"],
      outcomes: [
        {
          flow_id: "src/a.ts#entry:function",
          action: "hydrate",
          kind: "code",
          member_count: 2,
          last_synced_at: null,
          reason: "new entrypoint",
        },
        {
          flow_id: "src/b.ts#old:function",
          action: "retire",
          kind: "code",
          member_count: 0,
          last_synced_at: null,
          reason: "seed entrypoint gone",
        },
      ],
      deferred_retirements: [],
      deferred_skill_syncs: [],
      description_counts: { docstring: 0, provisional: 2, placeholder: 0, llm: 0 },
      diagnostics: [],
    },
    ...over,
  };
}

function graded(run_id: string): RunGradeRecord {
  return {
    schema_version: 1,
    run_id,
    verdict: "good",
    reason: "fine",
    graded_at: "t",
    detail: { mode: "default", file_set: [], transcript_available: true },
  };
}

const SPINE: TrajectorySpine = {
  schema_version: 1,
  run_id: "r-new",
  session_id: "s1",
  timestamp: "2026-07-10T12:00:30.000Z",
  transcript_available: true,
  availability_note: "",
  steps: [{ kind: "instruction", ordinal: 0, at: null, summary: "Launch the reconciler.", detail: {} }],
  detail: { mode: "default", notes: [] },
};

describe("select_ungraded", () => {
  it("keeps newest-first order and drops graded runs", () => {
    const records = [record("r-new"), record("r-mid"), record("r-old")];
    const grades = new Map([["r-mid", graded("r-mid")]]);
    expect(select_ungraded(records, grades).map((r) => r.run_id)).toEqual(["r-new", "r-old"]);
  });

  it("returns everything when nothing is graded", () => {
    expect(select_ungraded([record("a")], new Map()).map((r) => r.run_id)).toEqual(["a"]);
  });
});

describe("parse_grade_line", () => {
  it("accepts long and short verdict forms with the rest as the reason", () => {
    expect(parse_grade_line("good tracks the refactor")).toEqual({
      kind: "verdict",
      verdict: "good",
      reason: "tracks the refactor",
    });
    expect(parse_grade_line("b lost the retire")).toEqual({ kind: "verdict", verdict: "bad", reason: "lost the retire" });
    expect(parse_grade_line("MIXED partial")).toEqual({ kind: "verdict", verdict: "mixed", reason: "partial" });
  });

  it("treats empty, s, and skip as skip; q and quit as quit", () => {
    expect(parse_grade_line("")).toEqual({ kind: "skip" });
    expect(parse_grade_line("s")).toEqual({ kind: "skip" });
    expect(parse_grade_line("skip")).toEqual({ kind: "skip" });
    expect(parse_grade_line("q")).toEqual({ kind: "quit" });
    expect(parse_grade_line("quit")).toEqual({ kind: "quit" });
  });

  it("rejects an unknown verdict and a verdict without a reason", () => {
    expect(parse_grade_line("excellent nailed it").kind).toBe("invalid");
    expect(parse_grade_line("good").kind).toBe("invalid");
    expect(parse_grade_line("good   ").kind).toBe("invalid");
  });
});

describe("summarize_outcomes", () => {
  it("groups actions in the header and lists each outcome with its member count and reason", () => {
    const lines = summarize_outcomes(record("r"));
    expect(lines[0]).toBe("flows (hydrate 1, retire 1):");
    expect(lines[1]).toContain("hydrate src/a.ts#entry:function -> 2 member(s): new entrypoint");
    expect(lines[2]).toContain("retire src/b.ts#old:function -> 0 member(s): seed entrypoint gone");
  });

  it("says none touched for an outcome-less run", () => {
    const bare = record("r");
    bare.detail = { ...bare.detail, outcomes: [] };
    expect(summarize_outcomes(bare)).toEqual(["flows: none touched"]);
  });
});

describe("render_grading_screen", () => {
  it("composes the changed file set, the spine, and the flow summary", () => {
    const lines = render_grading_screen(record("r-new"), SPINE);
    const text = lines.join("\n");
    expect(text).toContain("changed files (2): src/a.ts, src/b.ts");
    expect(text).toContain("Launch the reconciler.");
    expect(text).toContain("flows (hydrate 1, retire 1):");
  });

  it("embeds the spine block as render_trajectory verbatim — the neutral seam", () => {
    const lines = render_grading_screen(record("r-new"), SPINE);
    const spine_block = render_trajectory(SPINE).join("\n");
    expect(lines.join("\n")).toContain(spine_block);
  });
});
