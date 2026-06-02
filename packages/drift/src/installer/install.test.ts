import { describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { CLAUDE_CODE_LAYOUT } from "./host_layout";
import { install_drift } from "./install";
import { read_hook_groups, read_mcp_server } from "./merge_settings";

// The package root: this test compiles from src/installer, so ../../ is packages/drift, where the
// real assets/ tree lives. install_drift copies from <package_root>/assets.
const PACKAGE_ROOT = path.resolve(__dirname, "..", "..");

function read_json(file_path: string): unknown {
  return JSON.parse(fs.readFileSync(file_path, "utf8"));
}

describe("install_drift (idempotency + asset install)", () => {
  it("installs exactly one of each artifact, and re-running leaves it unchanged", () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "drift-install-"));
    try {
      install_drift(target, CLAUDE_CODE_LAYOUT, PACKAGE_ROOT);
      install_drift(target, CLAUDE_CODE_LAYOUT, PACKAGE_ROOT);

      const settings_path = path.join(target, ".claude", "settings.json");
      const settings = read_json(settings_path);
      expect(read_hook_groups(settings, CLAUDE_CODE_LAYOUT, "Stop")).toHaveLength(1);
      expect(read_hook_groups(settings, CLAUDE_CODE_LAYOUT, "SessionStart")).toHaveLength(1);

      const mcp = read_json(path.join(target, ".mcp.json"));
      const drift_server = read_mcp_server(mcp, "drift");
      expect(drift_server?.command).toBe("node");
      expect(drift_server?.args[0]).toContain("drift_mcp.js");

      // The .claude asset bundle is present, exactly once each.
      expect(fs.existsSync(path.join(target, ".claude", "agents", "drift-reconciler.md"))).toBe(true);
      expect(fs.existsSync(path.join(target, ".claude", "skills", "drift-sync", "SKILL.md"))).toBe(true);
      expect(
        fs.existsSync(path.join(target, ".claude", "skills", "drift-sync", "scripts", "drift_sync.js")),
      ).toBe(true);
      expect(fs.existsSync(path.join(target, ".claude", "commands", "drift.md"))).toBe(true);

      // Idempotency at the byte level: a third run does not change settings.json.
      const before = fs.readFileSync(settings_path, "utf8");
      install_drift(target, CLAUDE_CODE_LAYOUT, PACKAGE_ROOT);
      expect(fs.readFileSync(settings_path, "utf8")).toBe(before);
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });

  it("preserves a user's pre-existing settings on install", () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "drift-install-"));
    try {
      const settings_path = path.join(target, ".claude", "settings.json");
      fs.mkdirSync(path.dirname(settings_path), { recursive: true });
      fs.writeFileSync(settings_path, JSON.stringify({ permissions: { allow: ["Bash(ls:*)"] } }));

      install_drift(target, CLAUDE_CODE_LAYOUT, PACKAGE_ROOT);

      const settings = read_json(settings_path);
      expect(read_hook_groups(settings, CLAUDE_CODE_LAYOUT, "Stop")).toHaveLength(1);
      const permissions = JSON.stringify(settings).includes("Bash(ls:*)");
      expect(permissions).toBe(true);
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });
});
