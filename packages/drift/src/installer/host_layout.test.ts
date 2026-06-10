import { describe, expect, it } from "@jest/globals";

import { build_hook_group, CLAUDE_CODE_LAYOUT, HOST_LAYOUTS, type HookArtifactSpec } from "./host_layout";

describe("host layout", () => {
  it("the Claude-Code layout targets .claude/settings.json", () => {
    expect(CLAUDE_CODE_LAYOUT.settings_file).toBe(".claude/settings.json");
    expect(HOST_LAYOUTS.claude_code).toBe(CLAUDE_CODE_LAYOUT);
  });

  it("build_hook_group emits a matcher-less command group", () => {
    const spec: HookArtifactSpec = {
      event_name: "Stop",
      command: "node x",
      identity_token: "t",
    };
    expect(build_hook_group(spec)).toEqual({ hooks: [{ type: "command", command: "node x" }] });
  });
});
