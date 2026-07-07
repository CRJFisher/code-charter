/**
 * The process-level reconcile mutex: at most one store-mutating reconcile per repo at a time.
 *
 * A lockfile beside the store, not a db-level lock, because a reconcile spans a whole bin
 * invocation — Ariadne indexing plus many store transactions. Connection-level discipline
 * (busy_timeout, BEGIN IMMEDIATE — set in @code-charter/core's SqliteGraphStore constructor)
 * serializes individual transactions but cannot stop two interleaved reconciles from clobbering
 * each other's read-compute-write cycles.
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

/**
 * Atomically create-or-fail — the actual mutual exclusion. The owner record is written to a temp
 * file and hard-linked into place: link(2) is atomic AND exclusive, so the lockfile can never be
 * observed half-written — a crash mid-acquire can never leave an empty lock that no reclaim could
 * ever parse.
 */
function try_create(lock_path: string): boolean {
  const tmp_path = `${lock_path}.${process.pid}.tmp`;
  fs.writeFileSync(tmp_path, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }));
  try {
    fs.linkSync(tmp_path, lock_path);
    return true;
  } catch (err) {
    if (is_errno(err, "EEXIST")) return false;
    throw err;
  } finally {
    fs.rmSync(tmp_path, { force: true });
  }
}

/**
 * True (after removing the file) when the holder recorded in the lockfile is dead. A lockfile
 * that cannot be read or parsed is treated as held — never steal a lock whose owner is unknown.
 */
function reclaim_if_stale(lock_path: string): boolean {
  let raw: string;
  try {
    raw = fs.readFileSync(lock_path, "utf8");
  } catch {
    return false; // vanished — the next try_create decides ownership
  }
  const pid = parse_pid(raw);
  if (pid === undefined) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (err) {
    if (!is_errno(err, "ESRCH")) {
      // EPERM: the holder is alive under another user — held.
      return false;
    }
  }
  // Re-read immediately before removing: another contender may have already reclaimed this stale
  // lock and created its own live one, and removing THAT would let two reconciles run at once.
  // Byte-equality shrinks the race to the instants between this read and the rm; the residual
  // overlap degrades to transaction-level serialization (busy_timeout + BEGIN IMMEDIATE), never
  // corruption.
  try {
    if (fs.readFileSync(lock_path, "utf8") !== raw) return false;
  } catch {
    return false;
  }
  fs.rmSync(lock_path, { force: true });
  return true;
}

function parse_pid(raw: string): number | undefined {
  let pid: unknown;
  try {
    pid = (JSON.parse(raw) as { pid?: unknown }).pid;
  } catch {
    return undefined;
  }
  return typeof pid === "number" && Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

function is_errno(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === code;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
