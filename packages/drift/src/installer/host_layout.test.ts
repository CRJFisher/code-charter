import { describe, expect, it } from "@jest/globals";

import { build_hook_group, CLAUDE_CODE_LAYOUT, HOST_LAYOUTS, type HookArtifactSpec } from "./host_layout";

describe("host layout", () => {
  it("the Claude-Code layout targets .claude/settings.json and .mcp.json", () => {
    expect(CLAUDE_CODE_LAYOUT.settings_file).toBe(".claude/settings.json");
    expect(CLAUDE_CODE_LAYOUT.mcp_config_file).toBe(".mcp.json");
    expect(HOST_LAYOUTS.claude_code).toBe(CLAUDE_CODE_LAYOUT);
  });

  it("build_hook_group omits the matcher when it is null (Stop)", () => {
    const spec: HookArtifactSpec = {
      event_name: "Stop",
      matcher: null,
      command: "node x",
      identity_token: "t",
    };
    expect(build_hook_group(spec)).toEqual({ hooks: [{ type: "command", command: "node x" }] });
  });

  it("build_hook_group includes the matcher when present (SessionStart)", () => {
    const spec: HookArtifactSpec = {
      event_name: "SessionStart",
      matcher: "startup",
      command: "node y",
      identity_token: "t",
    };
    expect(build_hook_group(spec)).toEqual({
      matcher: "startup",
      hooks: [{ type: "command", command: "node y" }],
    });
  });
});
