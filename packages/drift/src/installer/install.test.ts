import { describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { CLAUDE_CODE_LAYOUT } from "./host_layout";
import { install_drift, is_stop_hook_installed } from "./install";
import { read_hook_groups } from "./merge_settings";

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

      // The .claude asset bundle is present, exactly once each.
      expect(fs.existsSync(path.join(target, ".claude", "agents", "drift-reconciler.md"))).toBe(true);
      expect(fs.existsSync(path.join(target, ".claude", "skills", "drift-sync", "SKILL.md"))).toBe(true);
      expect(
        fs.existsSync(path.join(target, ".claude", "skills", "drift-sync", "scripts", "drift_sync.js")),
      ).toBe(true);
      expect(fs.existsSync(path.join(target, ".claude", "commands", "drift.md"))).toBe(true);

      // The dependency-free skill script finds the built reconcile bin via this installer-written sidecar.
      // It records an ABSOLUTE path: the bin lives in the drift package, not the target repo, so the
      // skill resolves it regardless of its cwd.
      const sidecar = path.join(target, ".claude", "skills", "drift-sync", ".drift_reconcile_bin");
      expect(fs.existsSync(sidecar)).toBe(true);
      const sidecar_bin = fs.readFileSync(sidecar, "utf8").trim();
      expect(sidecar_bin).toContain("drift_reconcile.js");
      expect(path.isAbsolute(sidecar_bin)).toBe(true);

      // The Stop hook command points at the bin by its absolute path, for the same reason.
      const stop_group = read_hook_groups(settings, CLAUDE_CODE_LAYOUT, "Stop")[0];
      const stop_command = stop_group.hooks[0].command;
      expect(stop_command).toContain("drift_stop_hook.js");
      expect(stop_command).toMatch(/node "\//);

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

  it("replaces a stale drift Stop entry so a moved package self-heals", () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "drift-install-"));
    try {
      const settings_path = path.join(target, ".claude", "settings.json");
      fs.mkdirSync(path.dirname(settings_path), { recursive: true });
      fs.writeFileSync(
        settings_path,
        JSON.stringify({
          hooks: { Stop: [{ hooks: [{ type: "command", command: 'node "/old/package/dist/bin/drift_stop_hook.js"' }] }] },
        }),
      );

      install_drift(target, CLAUDE_CODE_LAYOUT, PACKAGE_ROOT);

      const settings = read_json(settings_path);
      const stop = read_hook_groups(settings, CLAUDE_CODE_LAYOUT, "Stop");
      expect(stop).toHaveLength(1);
      expect(stop[0].hooks[0].command).not.toContain("/old/package/");
      expect(stop[0].hooks[0].command).toContain(PACKAGE_ROOT);
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });

  it("keeps a user's own Stop hook alongside the drift one", () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "drift-install-"));
    try {
      const settings_path = path.join(target, ".claude", "settings.json");
      fs.mkdirSync(path.dirname(settings_path), { recursive: true });
      fs.writeFileSync(
        settings_path,
        JSON.stringify({
          hooks: { Stop: [{ hooks: [{ type: "command", command: "node /user/their_hook.js" }] }] },
        }),
      );

      install_drift(target, CLAUDE_CODE_LAYOUT, PACKAGE_ROOT);

      const commands = read_hook_groups(read_json(settings_path), CLAUDE_CODE_LAYOUT, "Stop").map(
        (group) => group.hooks[0].command,
      );
      expect(commands).toHaveLength(2);
      expect(commands).toContain("node /user/their_hook.js");
      expect(commands.some((command) => command.includes("drift_stop_hook.js"))).toBe(true);
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });

  it("refuses to install when the hook bins are not built", () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "drift-install-"));
    const unbuilt_root = fs.mkdtempSync(path.join(os.tmpdir(), "drift-unbuilt-"));
    try {
      expect(() => install_drift(target, CLAUDE_CODE_LAYOUT, unbuilt_root)).toThrow(
        /not found.*npm run build/s,
      );
      // It fails before writing anything into the target.
      expect(fs.existsSync(path.join(target, ".claude"))).toBe(false);
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
      fs.rmSync(unbuilt_root, { recursive: true, force: true });
    }
  });

  it("refuses to overwrite a present-but-malformed settings.json (no silent data loss)", () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "drift-install-"));
    try {
      const settings_path = path.join(target, ".claude", "settings.json");
      fs.mkdirSync(path.dirname(settings_path), { recursive: true });
      const malformed = '{ "permissions": { "allow": ["Bash(ls:*)"] }, }'; // trailing comma
      fs.writeFileSync(settings_path, malformed);

      expect(() => install_drift(target, CLAUDE_CODE_LAYOUT, PACKAGE_ROOT)).toThrow(/not valid JSON/);
      // The user's file is left exactly as it was — not overwritten.
      expect(fs.readFileSync(settings_path, "utf8")).toBe(malformed);
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });
});

describe("is_stop_hook_installed (status-bar verification)", () => {
  it("is true after an install and false against an unwritten target", () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "drift-verify-"));
    try {
      expect(is_stop_hook_installed(target, CLAUDE_CODE_LAYOUT)).toBe(false);
      install_drift(target, CLAUDE_CODE_LAYOUT, PACKAGE_ROOT);
      expect(is_stop_hook_installed(target, CLAUDE_CODE_LAYOUT)).toBe(true);
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });

  it("is false when settings hold only foreign (non-drift) Stop hooks", () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "drift-verify-"));
    try {
      const settings_path = path.join(target, ".claude", "settings.json");
      fs.mkdirSync(path.dirname(settings_path), { recursive: true });
      fs.writeFileSync(
        settings_path,
        JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "node other_hook.js" }] }] } }),
      );
      expect(is_stop_hook_installed(target, CLAUDE_CODE_LAYOUT)).toBe(false);
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });

  it("reads a malformed settings.json as not-armed (re-install is the fix)", () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "drift-verify-"));
    try {
      const settings_path = path.join(target, ".claude", "settings.json");
      fs.mkdirSync(path.dirname(settings_path), { recursive: true });
      fs.writeFileSync(settings_path, "{ not valid json,");
      expect(is_stop_hook_installed(target, CLAUDE_CODE_LAYOUT)).toBe(false);
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });
});
