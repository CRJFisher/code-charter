import { describe, expect, it } from "@jest/globals";

import { build_session_start_output } from "./session_start_banner";

describe("build_session_start_output", () => {
  it("emits a read-only additionalContext banner listing the drifted files", () => {
    const output = build_session_start_output(["src/a.ts", "src/b.ts"]);
    expect(output.hookSpecificOutput?.hookEventName).toBe("SessionStart");
    const context = output.hookSpecificOutput?.additionalContext ?? "";
    expect(context).toContain("src/a.ts");
    expect(context).toContain("src/b.ts");
    expect(context).toContain("2 file(s)");
  });

  it("is strictly read-only: never carries a block/decision/continue key", () => {
    const output = build_session_start_output(["src/a.ts"]);
    expect(output).not.toHaveProperty("decision");
    expect(output).not.toHaveProperty("continue");
    expect(output).not.toHaveProperty("reason");
  });

  it("produces no banner when there is no outstanding drift", () => {
    expect(build_session_start_output([])).toEqual({});
  });
});
