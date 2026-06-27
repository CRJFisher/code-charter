import { describe, expect, it } from "@jest/globals";

import type { StopHookInput } from "./hook_payloads";
import { decide_stop_action, RECONCILER_AGENT_NAME } from "./stop_decision";

function stop_input(overrides: Partial<StopHookInput> = {}): StopHookInput {
  return {
    session_id: "s1",
    transcript_path: "/tmp/t.jsonl",
    cwd: "/repo",
    hook_event_name: "Stop",
    ...overrides,
  };
}

describe("decide_stop_action", () => {
  it("blocks and instructs the main agent to launch drift-reconciler, naming no files", () => {
    const decision = decide_stop_action(stop_input(), ["src/a.ts", "src/b.ts"]);
    expect(decision.block).toBe(true);
    if (decision.block) {
      expect(decision.instruction).toContain(RECONCILER_AGENT_NAME);
      // The file list travels via the staged pending file, never the instruction — keeping it out
      // of the main agent's context is the point of the handoff.
      expect(decision.instruction).not.toContain("src/a.ts");
      expect(decision.instruction).not.toContain("src/b.ts");
      expect(decision.system_message).toContain("2 changed file");
      expect(decision.system_message).toContain(RECONCILER_AGENT_NAME);
    }
  });

  it("no-ops when stop_hook_active is true (loop guard)", () => {
    expect(decide_stop_action(stop_input({ stop_hook_active: true }), ["src/a.ts"])).toEqual({
      block: false,
    });
  });

  it("no-ops when nothing was worked on (no new drift)", () => {
    expect(decide_stop_action(stop_input(), [])).toEqual({ block: false });
  });
});
