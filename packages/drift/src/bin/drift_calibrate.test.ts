import { describe, expect, it } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const CALIBRATE_BIN = path.resolve(__dirname, "..", "..", "dist", "bin", "drift_calibrate.js");

function line(run_id: string, verdict: string): string {
  return JSON.stringify({ schema_version: 1, run_id, verdict, reason: "r", graded_at: "t", detail: {} });
}

function run_calibrate(human: string[], judge: string[], extra: string[] = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-cal-"));
  const human_path = path.join(dir, "human.jsonl");
  const judge_path = path.join(dir, "judge.jsonl");
  fs.writeFileSync(human_path, human.join("\n") + "\n");
  fs.writeFileSync(judge_path, judge.join("\n") + "\n");
  const result = spawnSync("node", [CALIBRATE_BIN, human_path, judge_path, ...extra], { encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

describe("drift-calibrate bin", () => {
  it("reports raw agreement over the run_ids present in both files", () => {
    const result = run_calibrate(
      [line("a", "good"), line("b", "bad"), line("c", "mixed")],
      [line("a", "good"), line("b", "mixed"), line("c", "mixed")],
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("agreement: 2/3 (66.7%)");
    expect(result.stdout).toContain("bad->mixed: 1");
  });

  it("excludes unmatched run_ids from the denominator and reports coverage", () => {
    const result = run_calibrate([line("a", "good"), line("d", "bad")], [line("a", "good"), line("e", "bad")], [
      "--json",
    ]);
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as {
      joined: number;
      raw_agreement: number | null;
      human_only: string[];
      judge_only: string[];
    };
    expect(report.joined).toBe(1);
    expect(report.raw_agreement).toBe(1);
    expect(report.human_only).toEqual(["d"]);
    expect(report.judge_only).toEqual(["e"]);
  });

  it("skips malformed and foreign lines without aborting", () => {
    const result = run_calibrate(
      ["not json", JSON.stringify({ schema_version: 999, run_id: "x", verdict: "good" }), line("a", "good")],
      [line("a", "good")],
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("agreement: 1/1");
  });

  it("folds a duplicated run_id within one file last-wins", () => {
    const result = run_calibrate([line("a", "good"), line("a", "bad")], [line("a", "bad")]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("agreement: 1/1");
  });

  it("reports n/a agreement over an empty join instead of dividing by zero", () => {
    const result = run_calibrate([line("a", "good")], [line("b", "good")]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("agreement: 0/0 (n/a)");
  });

  it("exits 2 with usage when not given exactly two paths", () => {
    const result = spawnSync("node", [CALIBRATE_BIN, "/tmp/one.jsonl"], { encoding: "utf8" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage: drift-calibrate");
  });

  it("exits 1 naming the unreadable file when a path does not exist", () => {
    const result = spawnSync(
      "node",
      [CALIBRATE_BIN, "/nonexistent/human.jsonl", "/nonexistent/judge.jsonl"],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("cannot read /nonexistent/human.jsonl");
  });

  it("imports only node builtins — zero drift imports (the pinned seam)", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "drift_calibrate.ts"), "utf8");
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const specifier of imports) {
      expect(specifier).toMatch(/^node:/);
    }
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toMatch(/\bimport\s*\(/);
  });
});
