/**
 * The pending-reconcile handoff file: how the `Stop` hook hands the changed-file set AND the
 * session context (the transcript join key + the verbatim instruction) to the `drift-reconciler`
 * sub-agent WITHOUT routing either through the main agent's context. The hook bin stages the
 * handoff here (beside the store, so it is per-repo and shares the gitignored `.code-charter/`);
 * the `drift-sync` bundled script fetches and consumes it, forwarding the session context to the
 * reconcile bin. Paths are repo-relative forward-slash — the store's path space and the reconcile
 * bin's `--files` contract. The format is the pinned contract in
 * docs/contracts/pending_reconcile_handoff.md.
 *
 * Staging UNIONS files with any unconsumed prior set (session context is newest-contributor-wins)
 * and lands via temp-file + atomic rename, so the consumer can never observe a half-written
 * handoff. The consumer claims the file by renaming it (atomic, same directory) to a pid-stamped
 * private working name — `drift_pending_reconcile.claim.<pid>.json` — BEFORE reconciling: the
 * claim is deleted on success and unioned back into the live pending file on failure, so a Stop
 * fire that stages new edits mid-reconcile is never swallowed by the consume. A claim whose pid
 * is dead (a crashed consumer) is unioned back into the pending file on the next launch.
 *
 * The format is duplicated (by necessity) in `assets/skills/drift-sync/scripts/drift_sync.js`,
 * which runs standalone from an installed `.claude` directory and cannot import this module. The
 * claim lifecycle is implemented only there — this module carries only the shared format and the
 * staging writer; the duplicated byte format is pinned by the cross-check tests in
 * `src/skill/drift_sync_contract.test.ts`.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Mirrored in `drift_sync.js`. */
const PENDING_RECONCILE_FILE = "drift_pending_reconcile.json";

/** Advisory: parse failure, not a version check, is what invalidates a stale handoff. */
const PENDING_RECONCILE_VERSION = 1;

/** The session context of the Stop fire that staged the handoff. */
export interface PendingSession {
  session_id: string;
  cwd: string;
  instruction: string;
}

export interface PendingReconcile {
  files: string[];
  /** Null when no hook session produced the set (e.g. a test scaffold staged it directly). */
  session: PendingSession | null;
}

export function pending_reconcile_path(store_path: string): string {
  return path.join(path.dirname(store_path), PENDING_RECONCILE_FILE);
}

/**
 * Returns null for absent/malformed input so callers treat it as nothing pending. A handoff whose
 * `files` parse but whose `session` is malformed keeps its files with a null session — the file
 * set must never be dropped over broken metadata.
 */
export function parse_pending_reconcile(raw: string): PendingReconcile | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || !("files" in parsed)) return null;
  const files = parsed.files;
  if (!Array.isArray(files) || !files.every((f): f is string => typeof f === "string")) return null;
  return { files, session: parse_session("session" in parsed ? parsed.session : null) };
}

function parse_session(value: unknown): PendingSession | null {
  if (typeof value !== "object" || value === null) return null;
  const { session_id, cwd, instruction } = value as Record<string, unknown>;
  if (typeof session_id !== "string" || typeof cwd !== "string" || typeof instruction !== "string") {
    return null;
  }
  return { session_id, cwd, instruction };
}

/**
 * Files union first-seen (a retried handoff keeps stable ordering); session is the current fire's
 * when it has one, else the prior's — the newest contributor is the freshest join key, and a set
 * staged without session context must not erase the context of the set it joins.
 */
export function merge_pending_reconcile(prior: PendingReconcile, current: PendingReconcile): PendingReconcile {
  return {
    files: [...new Set([...prior.files, ...current.files])],
    session: current.session ?? prior.session,
  };
}

export function serialize_pending_reconcile(pending: PendingReconcile): string {
  return JSON.stringify({ version: PENDING_RECONCILE_VERSION, files: pending.files, session: pending.session });
}

/**
 * Write the staged set via a same-directory temp file + atomic rename. A plain write can be torn
 * by a crash or observed half-written by the concurrent consumer, which parses it as null and
 * silently drops the whole staged union. Atomic against concurrent readers and process crashes;
 * power-loss durability (fsync) is deliberately not promised. Throws on failure so the caller can
 * withhold the transcript watermark and retry the same edits next fire.
 */
export function write_pending_reconcile_atomic(pending_path: string, pending: PendingReconcile): void {
  fs.mkdirSync(path.dirname(pending_path), { recursive: true });
  const tmp_path = `${pending_path}.${process.pid}.tmp`;
  fs.writeFileSync(tmp_path, serialize_pending_reconcile(pending));
  try {
    fs.renameSync(tmp_path, pending_path);
  } catch (err) {
    fs.rmSync(tmp_path, { force: true });
    throw err;
  }
}
