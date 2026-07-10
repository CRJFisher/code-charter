import { describe, expect, it } from "@jest/globals";

import type { ReconcileRunRecord } from "../reconcile/reconcile_log";
import {
  build_trajectory_spine,
  find_reconciler_span,
  parse_context_steps,
  parse_stitch_umbrellas,
  type TrajectoryInputs,
} from "./trajectory_extract";

const INSTRUCTION = "Launch the `drift-reconciler` sub-agent.";

function record(over: Partial<ReconcileRunRecord> = {}): ReconcileRunRecord {
  return {
    schema_version: 1,
    run_id: "20260710T120000000Z-aabbccdd",
    session_id: "s1",
    transcript_path: "/projects/-repo/s1.jsonl",
    instruction: INSTRUCTION,
    timestamp: "2026-07-10T12:00:30.000Z",
    detail: {
      mode: "default",
      file_set: ["main.ts"],
      outcomes: [
        {
          flow_id: "main.ts#entry:function",
          action: "hydrate",
          kind: "code",
          member_count: 2,
          last_synced_at: "2026-07-10T12:00:29.000Z",
          reason: "new entrypoint over the changed files",
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

function assistant_line(items: unknown[], timestamp: string): string {
  return JSON.stringify({ type: "assistant", timestamp, message: { role: "assistant", content: items } });
}

function launch_item(tool_use_id: string, name = "Task", subagent_type = "drift-reconciler"): unknown {
  return { type: "tool_use", id: tool_use_id, name, input: { subagent_type, prompt: "reconcile" } };
}

function result_line(tool_use_id: string, agent_id: string | null, timestamp: string): string {
  const line: Record<string, unknown> = {
    type: "user",
    timestamp,
    message: { role: "user", content: [{ type: "tool_result", tool_use_id, content: "done" }] },
  };
  if (agent_id !== null) line.toolUseResult = { agentId: agent_id, status: "completed" };
  return JSON.stringify(line);
}

function main_transcript(lines: string[]): string {
  return lines.join("\n") + "\n";
}

const SUBAGENT_TEXT = main_transcript([
  assistant_line(
    [{ type: "tool_use", id: "st1", name: "Read", input: { file_path: "src/a.ts", limit: 40 } }],
    "2026-07-10T12:00:10.000Z",
  ),
  assistant_line([{ type: "text", text: "thinking out loud" }], "2026-07-10T12:00:11.000Z"),
  assistant_line(
    [{ type: "tool_use", id: "st2", name: "Grep", input: { pattern: "handle_create" } }],
    "2026-07-10T12:00:12.000Z",
  ),
  assistant_line(
    [{ type: "tool_use", id: "st3", name: "Bash", input: { command: "node drift_sync.js --list-entrypoints" } }],
    "2026-07-10T12:00:14.000Z",
  ),
]);

const HAPPY_MAIN = main_transcript([
  assistant_line([launch_item("tu_1")], "2026-07-10T12:00:05.000Z"),
  result_line("tu_1", "AG1", "2026-07-10T12:00:40.000Z"),
]);

function inputs(over: Partial<TrajectoryInputs> = {}): TrajectoryInputs {
  return {
    record: record(),
    main_transcript_text: HAPPY_MAIN,
    read_subagent_transcript: (agent_id) => (agent_id === "AG1" ? SUBAGENT_TEXT : null),
    find_agent_by_tool_use: () => null,
    stitch_json: JSON.stringify({
      umbrellas: [{ label: "create flow", seeds: ["a", "b"], rationale: "same dispatch table" }],
    }),
    bridges: [{ src_id: "a:function", dst_id: "b:function", rationale: "dynamic dispatch" }],
    is_latest_record: true,
    ...over,
  };
}

describe("find_reconciler_span", () => {
  it("joins the launch whose window contains the record's completion time", () => {
    const text = main_transcript([
      assistant_line([launch_item("tu_old")], "2026-07-10T11:00:00.000Z"),
      result_line("tu_old", "AG_old", "2026-07-10T11:01:00.000Z"),
      assistant_line([launch_item("tu_1")], "2026-07-10T12:00:05.000Z"),
      result_line("tu_1", "AG1", "2026-07-10T12:00:40.000Z"),
    ]);
    expect(find_reconciler_span(text, "2026-07-10T12:00:30.000Z")).toEqual({
      tool_use_id: "tu_1",
      agent_id: "AG1",
      launch_at: "2026-07-10T12:00:05.000Z",
      result_at: "2026-07-10T12:00:40.000Z",
    });
  });

  it("matches both Task and Agent launcher names", () => {
    const text = main_transcript([
      assistant_line([launch_item("tu_a", "Agent")], "2026-07-10T12:00:05.000Z"),
      result_line("tu_a", "AGX", "2026-07-10T12:00:40.000Z"),
    ]);
    expect(find_reconciler_span(text, "2026-07-10T12:00:30.000Z")?.agent_id).toBe("AGX");
  });

  it("ignores launches of other sub-agent types", () => {
    const text = main_transcript([
      assistant_line([launch_item("tu_x", "Task", "general-purpose")], "2026-07-10T12:00:05.000Z"),
      result_line("tu_x", "AGX", "2026-07-10T12:00:40.000Z"),
    ]);
    expect(find_reconciler_span(text, "2026-07-10T12:00:30.000Z")).toBeNull();
  });

  it("falls back to the latest launch at or before the record time when no window contains it", () => {
    const text = main_transcript([
      assistant_line([launch_item("tu_1")], "2026-07-10T12:00:05.000Z"),
      // no result line — the sub-agent is still running or the line was rotated away
    ]);
    expect(find_reconciler_span(text, "2026-07-10T12:00:30.000Z")?.tool_use_id).toBe("tu_1");
  });
});

describe("parse_context_steps", () => {
  it("yields tool name and target per tool_use in transcript order, skipping non-tool content", () => {
    expect(parse_context_steps(SUBAGENT_TEXT)).toEqual([
      { tool: "Read", target: "src/a.ts", at: "2026-07-10T12:00:10.000Z" },
      { tool: "Grep", target: "handle_create", at: "2026-07-10T12:00:12.000Z" },
      { tool: "Bash", target: "node drift_sync.js --list-entrypoints", at: "2026-07-10T12:00:14.000Z" },
    ]);
  });

  it("carries only the addressing field, never payload inputs", () => {
    const text = main_transcript([
      assistant_line(
        [
          {
            type: "tool_use",
            id: "e1",
            name: "Edit",
            input: { file_path: "src/a.ts", old_string: "SECRET OLD", new_string: "SECRET NEW" },
          },
        ],
        "2026-07-10T12:00:10.000Z",
      ),
    ]);
    const [step] = parse_context_steps(text);
    expect(step.target).toBe("src/a.ts");
    expect(JSON.stringify(step)).not.toContain("SECRET");
  });
});

describe("parse_stitch_umbrellas", () => {
  it("parses umbrellas leniently and degrades absent fields", () => {
    expect(parse_stitch_umbrellas('{"umbrellas":[{"label":"x","seeds":["a"],"rationale":"r"},{}]}')).toEqual([
      { label: "x", seed_count: 1, rationale: "r" },
      { label: "?", seed_count: 0, rationale: "" },
    ]);
    expect(parse_stitch_umbrellas(null)).toEqual([]);
    expect(parse_stitch_umbrellas("not json")).toEqual([]);
  });
});

describe("build_trajectory_spine", () => {
  it("assembles the canonical spine: instruction, context, judgement, effect with contiguous ordinals", () => {
    const spine = build_trajectory_spine(inputs());
    expect(spine.transcript_available).toBe(true);
    expect(spine.availability_note).toBe("");
    expect(spine.steps.map((s) => s.kind)).toEqual([
      "instruction",
      "context",
      "context",
      "context",
      "judgement",
      "judgement",
      "effect",
      "effect",
    ]);
    expect(spine.steps.map((s) => s.ordinal)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(spine.steps[0].summary).toBe(INSTRUCTION);
    expect(spine.steps[1].summary).toBe("Read src/a.ts");
    expect(spine.steps[4].summary).toBe('stitch "create flow" (2 seed(s)): same dispatch table');
    expect(spine.steps[5].summary).toBe("bridge a:function -> b:function: dynamic dispatch");
    expect(spine.steps[6].summary).toContain("hydrate main.ts#entry:function");
    expect(spine.steps[7].summary).toBe("described: docstring 0, llm 0, provisional 2, placeholder 0");
  });

  it("degrades to effect-only for a hand-invoked run with no session", () => {
    const spine = build_trajectory_spine(
      inputs({ record: record({ session_id: null, instruction: null, transcript_path: undefined }) }),
    );
    expect(spine.transcript_available).toBe(false);
    expect(spine.detail.availability_tier).toBe("no_session");
    expect(spine.availability_note).toContain("transcript unavailable");
    expect(spine.steps.some((s) => s.kind === "context")).toBe(false);
    expect(spine.steps.some((s) => s.kind === "effect")).toBe(true);
  });

  it("degrades with a file_missing tier when the transcript file is gone", () => {
    const spine = build_trajectory_spine(inputs({ main_transcript_text: null }));
    expect(spine.transcript_available).toBe(false);
    expect(spine.detail.availability_tier).toBe("file_missing");
    expect(spine.availability_note).toContain("missing");
  });

  it("degrades with a no_reconciler_span tier when the transcript has no reconciler launch", () => {
    const text = main_transcript([
      assistant_line([launch_item("tu_x", "Task", "general-purpose")], "2026-07-10T12:00:05.000Z"),
    ]);
    const spine = build_trajectory_spine(inputs({ main_transcript_text: text }));
    expect(spine.detail.availability_tier).toBe("no_reconciler_span");
  });

  it("degrades with a subagent_file_missing tier when the reconciler transcript is absent", () => {
    const spine = build_trajectory_spine(inputs({ read_subagent_transcript: () => null }));
    expect(spine.detail.availability_tier).toBe("subagent_file_missing");
    expect(spine.steps.some((s) => s.kind === "effect")).toBe(true);
  });

  it("resolves the agent through the meta fallback when the tool_result carried no agentId", () => {
    const text = main_transcript([
      assistant_line([launch_item("tu_1")], "2026-07-10T12:00:05.000Z"),
      result_line("tu_1", null, "2026-07-10T12:00:40.000Z"),
    ]);
    const spine = build_trajectory_spine(
      inputs({
        main_transcript_text: text,
        find_agent_by_tool_use: (tool_use_id) => (tool_use_id === "tu_1" ? "AG1" : null),
      }),
    );
    expect(spine.transcript_available).toBe(true);
    expect(spine.steps.filter((s) => s.kind === "context")).toHaveLength(3);
  });

  it("omits stitch judgement for a non-latest run and notes the sidecar staleness", () => {
    const spine = build_trajectory_spine(inputs({ is_latest_record: false }));
    const judgements = spine.steps.filter((s) => s.kind === "judgement");
    expect(judgements).toHaveLength(1); // only the persisted bridge survives
    expect(judgements[0].summary).toContain("bridge");
    expect(spine.detail.notes).toContainEqual(expect.stringContaining("newest run"));
  });

  it("emits every step with only the four neutral kinds", () => {
    const spine = build_trajectory_spine(inputs());
    const kinds = new Set(spine.steps.map((s) => s.kind));
    for (const kind of kinds) {
      expect(["instruction", "context", "judgement", "effect"]).toContain(kind);
    }
  });
});
