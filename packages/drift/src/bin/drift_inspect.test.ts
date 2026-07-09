import { describe, expect, it } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { Anomaly, StoreSummary } from "../inspect/summary";

const RECONCILE_BIN = path.resolve(__dirname, "..", "..", "dist", "bin", "drift_reconcile.js");
const INSPECT_BIN = path.resolve(__dirname, "..", "..", "dist", "bin", "drift_inspect.js");

function run(bin: string, args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync("node", [bin, ...args], { encoding: "utf8" });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

/** A repo with a hydrated store: one entry function calling a helper → one code flow. */
function reconciled_repo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-inspect-"));
  fs.writeFileSync(
    path.join(repo, "main.ts"),
    "export function entry() { return helper(); }\n\nfunction helper() { return 1; }\n",
  );
  const reconcile = run(RECONCILE_BIN, [
    "--files",
    "main.ts",
    "--store",
    path.join(repo, "graph.db"),
    "--repo-root",
    repo,
  ]);
  expect(reconcile.status).toBe(0);
  return repo;
}

describe("drift-inspect bin", () => {
  it("summarizes a hydrated store, reading membership from anchor_set (--json)", () => {
    const repo = reconciled_repo();
    try {
      const result = run(INSPECT_BIN, ["--store", path.join(repo, "graph.db"), "--json"]);
      expect(result.status).toBe(0);

      const summary = JSON.parse(result.stdout) as StoreSummary;
      expect(summary.live_flow_count).toBeGreaterThanOrEqual(1);
      const entry = summary.flows.find((flow) => flow.id === "main.ts#entry:function");
      expect(entry).toBeDefined();
      expect(entry?.member_count).toBeGreaterThanOrEqual(1);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("drills into one flow with --flow", () => {
    const repo = reconciled_repo();
    try {
      const result = run(INSPECT_BIN, ["--store", path.join(repo, "graph.db"), "--flow", "main.ts#entry:function"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("flow main.ts#entry:function [live]");
      expect(result.stdout).toContain("members (");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("exits 1 and names the flow when --flow is unknown", () => {
    const repo = reconciled_repo();
    try {
      const result = run(INSPECT_BIN, ["--store", path.join(repo, "graph.db"), "--flow", "does.ts#not:function"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('no flow with id "does.ts#not:function"');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("lints clean when the store is healthy and no stitch is declared", () => {
    const repo = reconciled_repo();
    try {
      const result = run(INSPECT_BIN, ["--store", path.join(repo, "graph.db"), "--lint"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("no anomalies detected");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("flags declared-but-unpersisted bridges and exits 1 (--lint --json)", () => {
    const repo = reconciled_repo();
    try {
      fs.writeFileSync(
        path.join(repo, "stitch.json"),
        JSON.stringify({ umbrellas: [{ label: "u", seeds: ["a", "b"], bridges: [{ from: "a", to: "b" }], rationale: "r" }] }),
      );

      const result = run(INSPECT_BIN, ["--store", path.join(repo, "graph.db"), "--lint", "--json"]);
      expect(result.status).toBe(1);
      const anomalies = JSON.parse(result.stdout) as Anomaly[];
      expect(anomalies.map((a) => a.code)).toContain("unpersisted_bridges");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("treats a never-reconciled store as the empty summary, not an error", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-inspect-cold-"));
    try {
      const result = run(INSPECT_BIN, ["--store", path.join(repo, "graph.db"), "--json"]);
      expect(result.status).toBe(0);
      const summary = JSON.parse(result.stdout) as StoreSummary;
      expect(summary.live_flow_count).toBe(0);
      expect(summary.sync_status).toBeNull();
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("errors with usage on a missing --store", () => {
    const result = run(INSPECT_BIN, ["--json"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("missing required --store");
  });
});
