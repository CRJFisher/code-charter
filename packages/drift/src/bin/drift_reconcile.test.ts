import { describe, expect, it } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Drives the built reconcile bin as a subprocess. Requires the package to be built (turbo `test`
// depends on it).
const BIN = path.resolve(__dirname, "..", "..", "dist", "bin", "drift_reconcile.js");

interface OutcomeRecord {
  flow_id: string;
  action: string;
  kind: string;
}

function run_bin(args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync("node", [BIN, ...args], { encoding: "utf8" });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

function run_reconcile(repo: string, files: string[]): { stdout: string; stderr: string; status: number | null } {
  return run_bin(["--files", files.join(","), "--store", path.join(repo, "graph.db"), "--repo-root", repo, "--json"]);
}

describe("drift-reconcile bin — retirement reporting (--json + summary)", () => {
  it("a rename run surfaces the retirement in the JSON outcomes and the summary line", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-bin-"));
    try {
      const v1 = "export function entry() { return helper(); }\n\nfunction helper() { return 1; }\n";
      fs.writeFileSync(path.join(repo, "main.ts"), v1);

      const first = run_reconcile(repo, ["main.ts"]);
      expect(first.status).toBe(0);
      const hydrated = JSON.parse(first.stdout) as OutcomeRecord[];
      expect(hydrated).toContainEqual(
        expect.objectContaining({ flow_id: "main.ts#entry:function", action: "hydrate" }),
      );

      fs.writeFileSync(path.join(repo, "main.ts"), v1.replace(/entry/g, "entry_renamed"));
      const second = run_reconcile(repo, ["main.ts"]);
      expect(second.status).toBe(0);

      const outcomes = JSON.parse(second.stdout) as OutcomeRecord[];
      expect(outcomes).toContainEqual(
        expect.objectContaining({ flow_id: "main.ts#entry:function", action: "retire", kind: "code" }),
      );
      expect(outcomes).toContainEqual(
        expect.objectContaining({ flow_id: "main.ts#entry_renamed:function", action: "hydrate" }),
      );
      expect(second.stderr).toMatch(/reconciled 2 flow\(s\) \(1 retired\) over 1 file\(s\)/);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("drift-reconcile bin — argument and no-op handling", () => {
  it("a missing required flag exits 2 and prints the usage banner", () => {
    const result = run_bin(["--files", "main.ts", "--repo-root", os.tmpdir()]);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/missing required --store/);
    expect(result.stderr).toContain("usage: drift-reconcile");
  });

  it("an unknown argument exits 2", () => {
    const result = run_bin(["--store", "/none.db", "--repo-root", os.tmpdir(), "--bogus"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/unknown argument: --bogus/);
  });

  it("combining two mode flags exits 2", () => {
    const result = run_bin([
      "--list-entrypoints",
      "--apply-stitch",
      "/none.json",
      "--store",
      "/none.db",
      "--repo-root",
      os.tmpdir(),
    ]);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/at most one mode flag is allowed/);
  });

  it("an empty file set is a --json no-op that emits an empty outcome array", () => {
    const result = run_bin(["--files", "", "--store", "/none.db", "--repo-root", os.tmpdir(), "--json"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("[]\n");
    expect(result.stderr).toMatch(/empty file set, no-op/);
  });

  it("list-entrypoints with an empty file set emits an empty inventory", () => {
    const result = run_bin(["--list-entrypoints", "--files", "", "--store", "/none.db", "--repo-root", os.tmpdir()]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ entrypoints: [] });
  });
});
