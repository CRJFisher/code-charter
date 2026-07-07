/**
 * The process-level reconcile mutex: at most one store-mutating reconcile per repo at a time.
 *
 * A lockfile beside the store, not a db-level lock, because a reconcile spans a whole bin
 * invocation — Ariadne indexing plus many store transactions. Connection-level discipline
 * (busy_timeout, BEGIN IMMEDIATE) serializes individual transactions but cannot stop two
 * interleaved reconciles from clobbering each other's read-compute-write cycles.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const LOCK_FILE = "drift_reconcile.lock";

export interface ReconcileLock {
  release(): void;
}

export function reconcile_lock_path(store_path: string): string {
  return path.join(path.dirname(store_path), LOCK_FILE);
}

/**
 * Acquire the mutex, polling up to `wait_ms` (a peer reconcile often finishes within a few
 * seconds). A lockfile whose recorded pid is no longer alive is reclaimed — a crashed reconcile
 * must not wedge the repo permanently. Returns null on timeout; the caller must exit nonzero so
 * the pending handoff file survives for the next launch (drift_sync.js consumes it on exit 0).
 */
export async function acquire_reconcile_lock(
  store_path: string,
  opts?: { wait_ms?: number; poll_ms?: number },
): Promise<ReconcileLock | null> {
  const wait_ms = opts?.wait_ms ?? 10_000;
  const poll_ms = opts?.poll_ms ?? 250;
  const lock_path = reconcile_lock_path(store_path);
  fs.mkdirSync(path.dirname(lock_path), { recursive: true });
  const deadline = Date.now() + wait_ms;
  for (;;) {
    if (try_create(lock_path)) return make_lock(lock_path);
    if (reclaim_if_stale(lock_path) && try_create(lock_path)) return make_lock(lock_path);
    if (Date.now() >= deadline) return null;
    await sleep(Math.min(poll_ms, deadline - Date.now()));
  }
}

function make_lock(lock_path: string): ReconcileLock {
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      fs.rmSync(lock_path, { force: true });
    },
  };
}

/** O_CREAT|O_EXCL ("wx") — atomically create-or-fail, the actual mutual exclusion. */
function try_create(lock_path: string): boolean {
  let fd: number;
  try {
    fd = fs.openSync(lock_path, "wx");
  } catch (err) {
    if (is_errno(err, "EEXIST")) return false;
    throw err;
  }
  try {
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }));
  } finally {
    fs.closeSync(fd);
  }
  return true;
}

/**
 * True (after removing the file) when the holder recorded in the lockfile is dead. A lockfile
 * that cannot be read or parsed is treated as held — never steal a lock whose owner is unknown.
 */
function reclaim_if_stale(lock_path: string): boolean {
  let pid: unknown;
  try {
    pid = (JSON.parse(fs.readFileSync(lock_path, "utf8")) as { pid?: unknown }).pid;
  } catch {
    return false;
  }
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (err) {
    if (is_errno(err, "ESRCH")) {
      fs.rmSync(lock_path, { force: true });
      return true;
    }
    // EPERM: the holder is alive under another user — held.
    return false;
  }
}

function is_errno(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === code;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
