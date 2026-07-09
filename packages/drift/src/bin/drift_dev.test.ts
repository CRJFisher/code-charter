import { describe, expect, it } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const RECONCILE_BIN = path.resolve(__dirname, "..", "..", "dist", "bin", "drift_reconcile.js");
const DEV_BIN = path.resolve(__dirname, "..", "..", "dist", "bin", "drift_dev.js");

function run(bin: string, args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync("node", [bin, ...args], { encoding: "utf8" });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

/** A repo with `main.ts` and no store yet. */
function fresh_repo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-dev-"));
  fs.writeFileSync(
    path.join(repo, "main.ts"),
    "export function entry() { return helper(); }\n\nfunction helper() { return 1; }\n",
  );
  return repo;
}

/** Hydrate the repo's real store so a warm before-state exists. */
function hydrate(repo: string): void {
  const reconcile = run(RECONCILE_BIN, [
    "--files",
    "main.ts",
    "--store",
    path.join(repo, ".code-charter", "graph.db"),
    "--repo-root",
    repo,
  ]);
  expect(reconcile.status).toBe(0);
}

describe("drift-dev bin", () => {
  it("previews a cold repo as an all-added diff without creating the real store", () => {
    const repo = fresh_repo();
    try {
      const result = run(DEV_BIN, ["--repo", repo, "--files", "main.ts"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("no Claude session, no token spend");
      expect(result.stdout).toContain("+ [live] main.ts#entry:function");
      // The scratch copy is thrown away; the real store must never come into existence.
      expect(fs.existsSync(path.join(repo, ".code-charter", "graph.db"))).toBe(false);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("reports a re-run over unchanged files as a no-op", () => {
    const repo = fresh_repo();
    try {
      hydrate(repo);
      const result = run(DEV_BIN, ["--repo", repo, "--files", "main.ts"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("no changes — the reconcile is a no-op for these files");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("shows retire+add for a renamed entrypoint and never mutates the real store", () => {
    const repo = fresh_repo();
    try {
      hydrate(repo);
      const store = path.join(repo, ".code-charter", "graph.db");
      const before_bytes = fs.readFileSync(store);

      fs.writeFileSync(
        path.join(repo, "main.ts"),
        "export function entry_renamed() { return helper(); }\n\nfunction helper() { return 1; }\n",
      );
      const result = run(DEV_BIN, ["--repo", repo, "--files", "main.ts"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("~ main.ts#entry:function: retired");
      expect(result.stdout).toContain("+ [live] main.ts#entry_renamed:function");

      // The real store bytes are identical — drift-dev reconciled a scratch copy, not this file.
      expect(fs.readFileSync(store).equals(before_bytes)).toBe(true);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("emits { outcomes, diff } under --json", () => {
    const repo = fresh_repo();
    try {
      hydrate(repo);
      fs.writeFileSync(
        path.join(repo, "main.ts"),
        "export function entry_renamed() { return helper(); }\n\nfunction helper() { return 1; }\n",
      );
      const result = run(DEV_BIN, ["--repo", repo, "--files", "main.ts", "--json"]);
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout) as {
        outcomes: { flow_id: string; action: string }[];
        diff: { unchanged: boolean; flows: unknown[] };
      };
      expect(parsed.outcomes.some((o) => o.action === "retire")).toBe(true);
      expect(parsed.outcomes.some((o) => o.action === "hydrate")).toBe(true);
      expect(parsed.diff.unchanged).toBe(false);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("errors with usage on a missing --repo", () => {
    const result = run(DEV_BIN, ["--files", "main.ts"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("missing required --repo");
  });

  it("errors with usage on a missing --files", () => {
    const result = run(DEV_BIN, ["--repo", "/tmp/x"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("missing required --files");
  });

  it("errors with usage on an unknown argument", () => {
    const result = run(DEV_BIN, ["--repo", "/tmp/x", "--files", "a.ts", "--bogus"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown argument: --bogus");
  });

  it("rejects an empty-string flag value as a usage error, not a deep fatal", () => {
    const result = run(DEV_BIN, ["--repo", "", "--files", "a.ts"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("missing value for --repo");
  });
});
