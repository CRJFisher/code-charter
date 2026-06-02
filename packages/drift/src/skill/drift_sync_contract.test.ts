import { describe, expect, it } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as path from "node:path";

// The drift-sync bundled stub ships as an asset and runs standalone (hosts without the Skill tool
// run it directly), so its contract is the CLI surface. These tests exercise it as a process.
const SCRIPT = path.resolve(
  __dirname,
  "..",
  "..",
  "assets",
  "skills",
  "drift-sync",
  "scripts",
  "drift_sync.js",
);

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("node", [SCRIPT, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("drift-sync stub contract", () => {
  it("parses --files, logs the hydrate dispatch per flow, no-ops the store, and exits 0", () => {
    const result = run(["--files", "src/a.ts,src/b.ts", "--store", "/tmp/none.db", "--repo-root", "/repo", "--json"]);
    expect(result.status).toBe(0);
    const records = JSON.parse(result.stdout);
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record.decision).toBe("hydrate");
      expect(record.mutated).toBe(false);
    }
    expect(result.stderr).toContain("no store mutation performed");
  });

  it("emits human-readable dispatch lines without --json", () => {
    const result = run(["--files", "src/a.ts", "--store", "/tmp/none.db", "--repo-root", "/repo"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("hydrate flow:src/a.ts");
  });

  it("no-ops cleanly on an empty file set (exit 0)", () => {
    const result = run(["--files", "", "--store", "/tmp/none.db", "--repo-root", "/repo", "--json"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
    expect(result.stderr).toContain("0 file(s)");
  });

  it("trims whitespace around file paths", () => {
    const result = run(["--files", " a.ts , b.ts ", "--store", "/tmp/none.db", "--repo-root", "/repo", "--json"]);
    const records = JSON.parse(result.stdout);
    expect(records.map((record: { file: string }) => record.file)).toEqual(["a.ts", "b.ts"]);
  });

  it("exits 2 on a missing required argument", () => {
    const result = run(["--store", "/tmp/none.db", "--repo-root", "/repo"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("missing required --files");
  });

  it("exits 2 (never crashes) when a value-flag has no value", () => {
    const result = run(["--store", "/tmp/none.db", "--repo-root", "/repo", "--files"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("missing value for --files");
  });

  it("exits 2 when a value-flag is immediately followed by another flag", () => {
    const result = run(["--files", "a.ts", "--repo-root", "--store", "/x"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("missing value for --repo-root");
  });

  it("exits 2 on an unknown argument", () => {
    const result = run(["--files", "a.ts", "--store", "/x", "--repo-root", "/r", "--bogus"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown argument");
  });
});
