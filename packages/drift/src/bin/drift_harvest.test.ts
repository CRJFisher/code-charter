import { describe, expect, it } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Spawns the built bins over a real reconciled store. Requires the package to be built (turbo
// `test` depends on it).
const RECONCILE_BIN = path.resolve(__dirname, "..", "..", "dist", "bin", "drift_reconcile.js");
const HARVEST_BIN = path.resolve(__dirname, "..", "..", "dist", "bin", "drift_harvest.js");

function run(bin: string, args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync("node", [bin, ...args], { encoding: "utf8" });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

/** A reconciled repo whose run log holds exactly one record; returns its run_id. */
function graded_repo(verdict: string | null): { repo: string; store: string; run_id: string; out: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-harvest-"));
  fs.mkdirSync(path.join(repo, "src"));
  fs.writeFileSync(
    path.join(repo, "src", "main.ts"),
    "export function entry() { return helper(); }\n\nfunction helper() { return 1; }\n",
  );
  fs.writeFileSync(path.join(repo, "unrelated.ts"), "export function untouched() { return 9; }\n");
  const store = path.join(repo, ".code-charter", "graph.db");
  expect(run(RECONCILE_BIN, ["--files", "src/main.ts", "--store", store, "--repo-root", repo]).status).toBe(0);
  const log = fs.readFileSync(path.join(path.dirname(store), "drift_reconcile_log.jsonl"), "utf8").trimEnd();
  const run_id = (JSON.parse(log) as { run_id: string }).run_id;
  if (verdict !== null) {
    fs.writeFileSync(
      path.join(path.dirname(store), "drift_run_grades.jsonl"),
      JSON.stringify({
        schema_version: 1,
        run_id,
        verdict,
        reason: "stitched correctly",
        graded_at: "2026-07-10T15:00:00.000Z",
        detail: { mode: "default", file_set: ["src/main.ts"], transcript_available: false },
      }) + "\n",
    );
  }
  return { repo, store, run_id, out: fs.mkdtempSync(path.join(os.tmpdir(), "drift-harvest-out-")) };
}

describe("drift-harvest bin", () => {
  it("freezes a good-graded run into a fixture with snapshot, manifest, and provenance", () => {
    const { repo, store, run_id, out } = graded_repo("good");
    try {
      const result = run(HARVEST_BIN, [
        "--store",
        store,
        "--repo-root",
        repo,
        "--run",
        run_id,
        "--out",
        out,
        "--slug",
        "sample",
      ]);
      expect(result.status).toBe(0);
      const fixture_dir = path.join(out, "sample");
      expect(fs.readFileSync(path.join(fixture_dir, "src", "main.ts"), "utf8")).toContain("function entry");
      expect(fs.existsSync(path.join(fixture_dir, "unrelated.ts"))).toBe(false); // file_set only, never the repo
      const manifest = JSON.parse(fs.readFileSync(path.join(fixture_dir, "fixture.json"), "utf8")) as {
        schema_version: number;
        run_id: string;
        verdict: string;
        detail: { kind: string; files: string[]; expected_flow_count: number; expected_members: string[] };
      };
      expect(manifest.schema_version).toBe(1);
      expect(manifest.run_id).toBe(run_id);
      expect(manifest.verdict).toBe("good");
      expect(Object.keys(manifest).sort()).toEqual([
        "detail",
        "graded_at",
        "harvested_at",
        "reason",
        "run_id",
        "schema_version",
        "source_repo",
        "verdict",
      ]);
      expect(manifest.detail.files).toEqual(["src/main.ts"]);
      expect(manifest.detail.kind).toBe("decline"); // one singleton flow, no bridge, single seed
      expect(manifest.detail.expected_flow_count).toBe(1);
      expect(manifest.detail.expected_members).toContain("src/main.ts#entry:function");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  it("re-harvesting the same run rewrites the same fixture dir — idempotent", () => {
    const { repo, store, run_id, out } = graded_repo("good");
    try {
      const args = ["--store", store, "--repo-root", repo, "--run", run_id, "--out", out, "--slug", "sample"];
      expect(run(HARVEST_BIN, args).status).toBe(0);
      const first = fs.readFileSync(path.join(out, "sample", "src", "main.ts"), "utf8");
      expect(run(HARVEST_BIN, args).status).toBe(0);
      expect(fs.readdirSync(out)).toEqual(["sample"]);
      expect(fs.readFileSync(path.join(out, "sample", "src", "main.ts"), "utf8")).toBe(first);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  it("refuses an ungraded run", () => {
    const { repo, store, run_id, out } = graded_repo(null);
    try {
      const result = run(HARVEST_BIN, ["--store", store, "--repo-root", repo, "--run", run_id, "--out", out]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("ungraded");
      expect(fs.readdirSync(out)).toEqual([]);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  it("refuses a bad-graded run — only good runs mint positive goldens", () => {
    const { repo, store, run_id, out } = graded_repo("bad");
    try {
      const result = run(HARVEST_BIN, ["--store", store, "--repo-root", repo, "--run", run_id, "--out", out]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('graded "bad"');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  it("refuses an unknown run id", () => {
    const { repo, store, out } = graded_repo("good");
    try {
      const result = run(HARVEST_BIN, ["--store", store, "--repo-root", repo, "--run", "nope", "--out", out]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("no reconcile run");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});
