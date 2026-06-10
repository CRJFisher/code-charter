import { describe, expect, it } from "@jest/globals";

import { CLAUDE_CODE_LAYOUT, type HookArtifactSpec } from "./host_layout";
import { hook_group_is_ours, merge_all_hooks, read_hook_groups } from "./merge_settings";

const STOP_SPEC: HookArtifactSpec = {
  event_name: "Stop",
  command: "node /pkg/dist/bin/drift_stop_hook.js",
  identity_token: "drift_stop_hook",
};
const SPECS = [STOP_SPEC];

describe("merge_all_hooks", () => {
  it("installs one matcher-less Stop entry", () => {
    const merged = merge_all_hooks({}, CLAUDE_CODE_LAYOUT, SPECS);
    const stop = read_hook_groups(merged, CLAUDE_CODE_LAYOUT, "Stop");
    expect(stop).toHaveLength(1);
    expect(stop[0].matcher).toBeUndefined();
  });

  it("is idempotent: re-merging leaves exactly one entry per event", () => {
    const once = merge_all_hooks({}, CLAUDE_CODE_LAYOUT, SPECS);
    const twice = merge_all_hooks(once, CLAUDE_CODE_LAYOUT, SPECS);
    expect(twice).toEqual(once);
    expect(read_hook_groups(twice, CLAUDE_CODE_LAYOUT, "Stop")).toHaveLength(1);
  });

  it("collapses pre-existing duplicate drift groups to one", () => {
    const seeded = {
      hooks: {
        Stop: [
          { hooks: [{ type: "command", command: "node /old/drift_stop_hook.js" }] },
          { hooks: [{ type: "command", command: "node /older/drift_stop_hook.js" }] },
        ],
      },
    };
    const merged = merge_all_hooks(seeded, CLAUDE_CODE_LAYOUT, SPECS);
    const stop = read_hook_groups(merged, CLAUDE_CODE_LAYOUT, "Stop");
    expect(stop).toHaveLength(1);
    expect(stop[0].hooks[0].command).toBe(STOP_SPEC.command);
  });

  it("preserves the user's own hooks and other settings keys", () => {
    const seeded = {
      $schema: "https://example/schema.json",
      permissions: { allow: ["Bash(ls:*)"] },
      hooks: { Stop: [{ hooks: [{ type: "command", command: "node /user/their-hook.js" }] }] },
    };
    const merged = merge_all_hooks(seeded, CLAUDE_CODE_LAYOUT, SPECS);
    expect(merged.$schema).toBe(seeded.$schema);
    expect(merged.permissions).toEqual(seeded.permissions);
    const commands = read_hook_groups(merged, CLAUDE_CODE_LAYOUT, "Stop").map((g) => g.hooks[0].command);
    expect(commands).toHaveLength(2);
    expect(commands).toContain("node /user/their-hook.js");
    expect(commands).toContain(STOP_SPEC.command);
  });
});

describe("hook_group_is_ours", () => {
  it("recognises a group by its command identity token", () => {
    expect(
      hook_group_is_ours({ hooks: [{ type: "command", command: "x drift_stop_hook y" }] }, "drift_stop_hook"),
    ).toBe(true);
    expect(hook_group_is_ours({ hooks: [{ type: "command", command: "other" }] }, "drift_stop_hook")).toBe(false);
    expect(hook_group_is_ours("not-a-group", "drift_stop_hook")).toBe(false);
  });
});
