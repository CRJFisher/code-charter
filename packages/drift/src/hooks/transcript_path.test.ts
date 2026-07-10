import { describe, expect, it } from "@jest/globals";
import * as os from "node:os";
import * as path from "node:path";

import { derive_transcript_path, slugify_claude_project_dir } from "./transcript_path";

describe("slugify_claude_project_dir", () => {
  it("maps every non-alphanumeric character to a dash, keeping case and digits", () => {
    expect(slugify_claude_project_dir("/Users/chuck/workspace/code-charter")).toBe(
      "-Users-chuck-workspace-code-charter",
    );
  });

  // Pinned against observed host slugs: `.claude` yields `--claude` and `__x` yields `--x`.
  it("maps dots and underscores to dashes, doubling with the path separator's dash", () => {
    expect(slugify_claude_project_dir("/Users/chuck/workspace/ariadne/.claude/skills")).toBe(
      "-Users-chuck-workspace-ariadne--claude-skills",
    );
    expect(slugify_claude_project_dir("/var/folders/tc/95b1f46j1g3cjktn__xcv6z80000gn/T")).toBe(
      "-var-folders-tc-95b1f46j1g3cjktn--xcv6z80000gn-T",
    );
  });
});

describe("derive_transcript_path", () => {
  it("builds <config>/projects/<slug>/<session_id>.jsonl from CLAUDE_CONFIG_DIR", () => {
    expect(derive_transcript_path("/repo/sub", "abc-123", { CLAUDE_CONFIG_DIR: "/cfg" })).toBe(
      path.join("/cfg", "projects", "-repo-sub", "abc-123.jsonl"),
    );
  });

  it("falls back to ~/.claude when CLAUDE_CONFIG_DIR is unset or empty", () => {
    const expected = path.join(os.homedir(), ".claude", "projects", "-repo", "s1.jsonl");
    expect(derive_transcript_path("/repo", "s1", {})).toBe(expected);
    expect(derive_transcript_path("/repo", "s1", { CLAUDE_CONFIG_DIR: "" })).toBe(expected);
  });
});
