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
    const output = build_session_start_output([
      observation(),
      observation({
        node_id: "user:description:other",
        from_symbol_path: "src/b.ts#x:function",
        to_symbol_path: "src/b.ts#y:function",
      }),
    ]);
    expect(output.hookSpecificOutput?.hookEventName).toBe("SessionStart");
    const context = output.hookSpecificOutput?.additionalContext ?? "";
    expect(context).toContain("2 node(s)");
    expect(context).toContain("src/app.ts#compute:function");
    expect(context).toContain("src/app.ts#calculate:function");
    expect(context).toContain("user:description:helper");
    expect(context).toContain("drift.resolve");
  });

  it("is strictly read-only: never carries a block/decision/continue key", () => {
    const output = build_session_start_output([observation()]);
    expect(output).not.toHaveProperty("decision");
    expect(output).not.toHaveProperty("continue");
    expect(output).not.toHaveProperty("reason");
  });

  it("produces no banner when there is no outstanding drift", () => {
    expect(build_session_start_output([])).toEqual({});
  });
});
