import { describe, expect, it } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  read_sync_status,
  reconcile_log_path,
  sync_status_path,
  type ReconcileLogRecord,
} from "../reconcile/reconcile_log";

// Drives the built reconcile bin as a subprocess. Requires the package to be built (turbo `test`
// depends on it).
const BIN = path.resolve(__dirname, "..", "..", "dist", "bin", "drift_reconcile.js");

interface OutcomeRecord {
  flow_id: string;
  action: string;
  kind: string;
}

function run_bin(
  args: string[],
  env?: Record<string, string>,
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync("node", [BIN, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

function run_reconcile(
  repo: string,
  files: string[],
  opts?: { extra_args?: string[]; env?: Record<string, string> },
): { stdout: string; stderr: string; status: number | null } {
  return run_bin(
    [
      "--files",
      files.join(","),
      "--store",
      path.join(repo, "graph.db"),
      "--repo-root",
      repo,
      "--json",
      ...(opts?.extra_args ?? []),
    ],
    opts?.env,
  );
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

describe("drift-reconcile bin — reconcile mutex (task-27.1.20.1)", () => {
  const SOURCE = "export function entry() { return helper(); }\n\nfunction helper() { return 1; }\n";

  /** A pid guaranteed dead: a child that has already exited by the time spawnSync returns. */
  function dead_pid(): number {
    const child = spawnSync("node", ["-e", ""]);
    if (child.pid === undefined) throw new Error("could not spawn a probe child");
    return child.pid;
  }

  it("a held lock makes a reconcile exit 1 without touching the store", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-bin-lock-"));
    try {
      fs.writeFileSync(path.join(repo, "main.ts"), SOURCE);
      const lock_path = path.join(repo, "drift_reconcile.lock");
      // this jest process is the live holder
      fs.writeFileSync(lock_path, JSON.stringify({ pid: process.pid, started_at: "t" }));

      const result = run_reconcile(repo, ["main.ts"], { env: { DRIFT_RECONCILE_LOCK_WAIT_MS: "200" } });

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/another reconcile is running/);
      expect(fs.existsSync(path.join(repo, "graph.db"))).toBe(false);
      // a contender must never delete the lock it failed to acquire
      expect(fs.existsSync(lock_path)).toBe(true);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("a stale lock from a dead process is reclaimed and the reconcile proceeds", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-bin-stale-"));
    try {
      fs.writeFileSync(path.join(repo, "main.ts"), SOURCE);
      const lock_path = path.join(repo, "drift_reconcile.lock");
      fs.writeFileSync(lock_path, JSON.stringify({ pid: dead_pid(), started_at: "t" }));

      const result = run_reconcile(repo, ["main.ts"], { env: { DRIFT_RECONCILE_LOCK_WAIT_MS: "200" } });

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout) as OutcomeRecord[]).toContainEqual(
        expect.objectContaining({ flow_id: "main.ts#entry:function", action: "hydrate" }),
      );
      expect(fs.existsSync(lock_path)).toBe(false);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("a successful reconcile leaves no lockfile behind", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-bin-release-"));
    try {
      fs.writeFileSync(path.join(repo, "main.ts"), SOURCE);

      const result = run_reconcile(repo, ["main.ts"]);

      expect(result.status).toBe(0);
      expect(fs.existsSync(path.join(repo, "drift_reconcile.lock"))).toBe(false);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("a run that fails after acquiring the lock still releases it", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-bin-fatal-"));
    try {
      fs.writeFileSync(path.join(repo, "main.ts"), SOURCE);
      // a garbage db file makes open_graph_store throw after the lock is acquired
      fs.writeFileSync(path.join(repo, "graph.db"), "not a sqlite database");

      const result = run_reconcile(repo, ["main.ts"]);

      expect(result.status).toBe(1);
      expect(fs.existsSync(path.join(repo, "drift_reconcile.lock"))).toBe(false);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("--dry-run takes no lock of its own", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-bin-dry-free-"));
    try {
      fs.writeFileSync(path.join(repo, "main.ts"), SOURCE);

      const result = run_reconcile(repo, ["main.ts"], { extra_args: ["--dry-run"] });

      expect(result.status).toBe(0);
      expect(fs.existsSync(path.join(repo, "drift_reconcile.lock"))).toBe(false);
      // dry at the connection level: a cold repo's db is never created by a dry run
      expect(fs.existsSync(path.join(repo, "graph.db"))).toBe(false);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("--dry-run ignores a held lock", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-bin-dry-"));
    try {
      fs.writeFileSync(path.join(repo, "main.ts"), SOURCE);
      fs.writeFileSync(
        path.join(repo, "drift_reconcile.lock"),
        JSON.stringify({ pid: process.pid, started_at: "t" }),
      );

      const result = run_reconcile(repo, ["main.ts"], {
        extra_args: ["--dry-run"],
        env: { DRIFT_RECONCILE_LOCK_WAIT_MS: "200" },
      });

      expect(result.status).toBe(0);
      expect(result.stderr).not.toMatch(/another reconcile is running/);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("drift-reconcile bin — run log and sync status (task-27.1.20.3)", () => {
  const SOURCE = "export function entry() { return helper(); }\n\nfunction helper() { return 1; }\n";

  function read_log(repo: string): ReconcileLogRecord[] {
    const raw = fs.readFileSync(reconcile_log_path(path.join(repo, "graph.db")), "utf8");
    return raw
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as ReconcileLogRecord);
  }

  it("a reconcile appends a run record with the file set, per-flow action and reason, and describe counts", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-bin-log-"));
    try {
      fs.writeFileSync(path.join(repo, "main.ts"), SOURCE);

      expect(run_reconcile(repo, ["main.ts"]).status).toBe(0);

      const records = read_log(repo);
      expect(records).toHaveLength(1);
      const record = records[0];
      expect(record.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(record.mode).toBe("default");
      expect(record.file_set).toEqual(["main.ts"]);
      expect(record.outcomes).toContainEqual(
        expect.objectContaining({
          flow_id: "main.ts#entry:function",
          action: "hydrate",
          reason: expect.stringContaining("new entrypoint"),
        }),
      );
      // Neither member surfaces an Ariadne docstring, so both land in the placeholder bucket.
      expect(record.description_counts).toEqual({ docstring: 0, placeholder: 2, llm: 0 });
      expect(record.deferred_retirements).toEqual([]);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("a retirement's run record carries the seed-entrypoint-gone reason", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-bin-log-retire-"));
    try {
      fs.writeFileSync(path.join(repo, "main.ts"), SOURCE);
      expect(run_reconcile(repo, ["main.ts"]).status).toBe(0);

      fs.writeFileSync(path.join(repo, "main.ts"), SOURCE.replace(/entry/g, "entry_renamed"));
      expect(run_reconcile(repo, ["main.ts"]).status).toBe(0);

      const records = read_log(repo);
      expect(records).toHaveLength(2);
      expect(records[1].outcomes).toContainEqual(
        expect.objectContaining({
          flow_id: "main.ts#entry:function",
          action: "retire",
          reason: expect.stringContaining("seed entrypoint gone"),
        }),
      );
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("a successful run stamps last_attempt_at and last_success_at with no error", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-bin-status-"));
    try {
      fs.writeFileSync(path.join(repo, "main.ts"), SOURCE);

      expect(run_reconcile(repo, ["main.ts"]).status).toBe(0);

      const status = read_sync_status(path.join(repo, "graph.db"));
      expect(status.last_attempt_at).not.toBeNull();
      expect(status.last_success_at).not.toBeNull();
      expect(status.last_error).toBeNull();
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("a fatal run records last_error and preserves the prior last_success_at", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-bin-status-fatal-"));
    try {
      fs.writeFileSync(path.join(repo, "main.ts"), SOURCE);
      expect(run_reconcile(repo, ["main.ts"]).status).toBe(0);
      const success_at = read_sync_status(path.join(repo, "graph.db")).last_success_at;

      // A garbage db makes open_graph_store throw after the attempt stamp.
      fs.writeFileSync(path.join(repo, "graph.db"), "not a sqlite database");
      const result = run_reconcile(repo, ["main.ts"]);

      expect(result.status).toBe(1);
      const status = read_sync_status(path.join(repo, "graph.db"));
      expect(status.last_error).not.toBeNull();
      expect(status.last_error!.message).toMatch(/./);
      expect(status.last_success_at).toBe(success_at);
      // The dropped/failed run is visible: the newest attempt did not become a success.
      expect(status.last_attempt_at! > status.last_success_at!).toBe(true);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("lock contention records last_error so a dropped reconcile is distinguishable from nothing-changed", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-bin-status-lock-"));
    try {
      fs.writeFileSync(path.join(repo, "main.ts"), SOURCE);
      fs.writeFileSync(
        path.join(repo, "drift_reconcile.lock"),
        JSON.stringify({ pid: process.pid, started_at: "t" }),
      );

      const result = run_reconcile(repo, ["main.ts"], { env: { DRIFT_RECONCILE_LOCK_WAIT_MS: "200" } });

      expect(result.status).toBe(1);
      const status = read_sync_status(path.join(repo, "graph.db"));
      expect(status.last_attempt_at).not.toBeNull();
      expect(status.last_success_at).toBeNull();
      expect(status.last_error!.message).toMatch(/contention/);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("--dry-run writes neither the run log nor the status file", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-bin-log-dry-"));
    try {
      fs.writeFileSync(path.join(repo, "main.ts"), SOURCE);

      const result = run_reconcile(repo, ["main.ts"], { extra_args: ["--dry-run"] });

      expect(result.status).toBe(0);
      expect(fs.existsSync(reconcile_log_path(path.join(repo, "graph.db")))).toBe(false);
      expect(fs.existsSync(sync_status_path(path.join(repo, "graph.db")))).toBe(false);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("an empty file set records a healthy no-op run", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-bin-log-noop-"));
    try {
      const result = run_reconcile(repo, []);

      expect(result.status).toBe(0);
      const records = read_log(repo);
      expect(records).toHaveLength(1);
      expect(records[0].file_set).toEqual([]);
      expect(records[0].outcomes).toEqual([]);
      const status = read_sync_status(path.join(repo, "graph.db"));
      expect(status.last_success_at).not.toBeNull();
      expect(status.last_error).toBeNull();
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
