import { describe, expect, it } from "@jest/globals";

import type { DriftObservation } from "@code-charter/core";

import { build_session_start_output } from "./session_start_banner";

function observation(over: Partial<DriftObservation> = {}): DriftObservation {
  return {
    node_id: "user:description:helper",
    from_symbol_path: "src/app.ts#compute:function",
    to_symbol_path: "src/app.ts#calculate:function",
    to_content_hash: "a".repeat(64),
    reason: "relocated",
    ...over,
  };
}

describe("build_session_start_output", () => {
  it("reports the outstanding drift count and each drifted node as a punch-list item", () => {
    const output = build_session_start_output(
      [
        observation(),
        observation({
          node_id: "user:description:other",
          from_symbol_path: "src/b.ts#x:function",
          to_symbol_path: "src/b.ts#y:function",
        }),
      ],
      0,
    );
    expect(output.hookSpecificOutput?.hookEventName).toBe("SessionStart");
    const context = output.hookSpecificOutput?.additionalContext ?? "";
    expect(context).toContain("2 node(s)");
    expect(context).toContain("src/app.ts#compute:function");
    expect(context).toContain("src/app.ts#calculate:function");
    expect(context).toContain("user:description:helper");
    expect(context).toContain("drift.resolve");
  });

  it("points at the richer recovery loop — drift.next, candidate targets, and reattach-onto-target", () => {
    const context = build_session_start_output([observation()], 0).hookSpecificOutput?.additionalContext ?? "";
    expect(context).toContain("drift.next");
    expect(context).toContain("candidate");
    expect(context).toContain("target");
  });

  it("surfaces the re-attachment bin even when nothing relocated (miss-only session)", () => {
    const output = build_session_start_output([], 3);
    const context = output.hookSpecificOutput?.additionalContext ?? "";
    expect(context).toContain("3 description(s)");
    expect(context).toContain("re-attachment bin");
    expect(context).toContain("drift.list");
    expect(context).toContain("drift.next");
  });

  it("is strictly read-only: never carries a block/decision/continue key", () => {
    const output = build_session_start_output([observation()], 0);
    expect(output).not.toHaveProperty("decision");
    expect(output).not.toHaveProperty("continue");
    expect(output).not.toHaveProperty("reason");
  });

  it("produces no banner when both populations are empty", () => {
    expect(build_session_start_output([], 0)).toEqual({});
  });
});
