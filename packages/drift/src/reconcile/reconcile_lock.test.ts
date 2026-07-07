import { describe, expect, it, afterAll } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { acquire_reconcile_lock, reconcile_lock_path } from "./reconcile_lock";

const created_dirs: string[] = [];

afterAll(() => {
  for (const dir of created_dirs) fs.rmSync(dir, { recursive: true, force: true });
});

function temp_store_path(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-lock-"));
  created_dirs.push(dir);
  return path.join(dir, "graph.db");
}

/** A pid guaranteed dead: a child that has already exited by the time spawnSync returns. */
function dead_pid(): number {
  const child = spawnSync("node", ["-e", ""]);
  if (child.pid === undefined) throw new Error("could not spawn a probe child");
  return child.pid;
}

describe("reconcile_lock", () => {
  it("puts the lock beside the store", () => {
    expect(reconcile_lock_path(path.join("a", "b", "graph.db"))).toBe(path.join("a", "b", "drift_reconcile.lock"));
  });

  it("acquires when no lock is held and releases on release()", async () => {
    const store = temp_store_path();
    const lock = await acquire_reconcile_lock(store, { wait_ms: 0 });
    expect(lock).not.toBeNull();
    expect(fs.existsSync(reconcile_lock_path(store))).toBe(true);
    lock!.release();
    expect(fs.existsSync(reconcile_lock_path(store))).toBe(false);
  });

  it("times out against a live holder and reacquires after release", async () => {
    const store = temp_store_path();
    const first = await acquire_reconcile_lock(store, { wait_ms: 0 });
    expect(first).not.toBeNull();

    const contender = await acquire_reconcile_lock(store, { wait_ms: 150, poll_ms: 50 });
    expect(contender).toBeNull();

    first!.release();
    const second = await acquire_reconcile_lock(store, { wait_ms: 0 });
    expect(second).not.toBeNull();
    second!.release();
  });

  it("reclaims a lock whose recorded pid is dead", async () => {
    const store = temp_store_path();
    fs.writeFileSync(reconcile_lock_path(store), JSON.stringify({ pid: dead_pid(), started_at: "t" }));

    const lock = await acquire_reconcile_lock(store, { wait_ms: 0 });
    expect(lock).not.toBeNull();
    lock!.release();
  });

  it("never reclaims a lock held by a live pid", async () => {
    const store = temp_store_path();
    fs.writeFileSync(reconcile_lock_path(store), JSON.stringify({ pid: process.pid, started_at: "t" }));

    expect(await acquire_reconcile_lock(store, { wait_ms: 100, poll_ms: 50 })).toBeNull();
    expect(fs.existsSync(reconcile_lock_path(store))).toBe(true);
  });

  it("treats a malformed lockfile as held rather than stealing it", async () => {
    const store = temp_store_path();
    fs.writeFileSync(reconcile_lock_path(store), "not json");

    expect(await acquire_reconcile_lock(store, { wait_ms: 100, poll_ms: 50 })).toBeNull();
    expect(fs.readFileSync(reconcile_lock_path(store), "utf8")).toBe("not json");
  });

  it("release is idempotent", async () => {
    const store = temp_store_path();
    const lock = await acquire_reconcile_lock(store, { wait_ms: 0 });
    lock!.release();
    expect(() => lock!.release()).not.toThrow();
  });

  it("creates the store directory when it does not exist yet", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-lock-cold-"));
    created_dirs.push(dir);
    const store = path.join(dir, ".code-charter", "graph.db");

    const lock = await acquire_reconcile_lock(store, { wait_ms: 0 });
    expect(lock).not.toBeNull();
    lock!.release();
  });
});
