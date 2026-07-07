/**
 * The pending-reconcile handoff file: how the `Stop` hook hands the changed-file set to the
 * `drift-reconciler` sub-agent WITHOUT routing the list through the main agent's context. The hook
 * bin stages the set here (beside the store, so it is per-repo and shares the gitignored
 * `.code-charter/`); the `drift-sync` bundled script fetches and consumes it. Paths are
 * repo-relative forward-slash — the store's path space and the reconcile bin's `--files` contract.
 *
 * Staging UNIONS with any unconsumed prior set and lands via temp-file + atomic rename, so the
 * consumer can never observe a half-written handoff. The consumer claims the file by renaming it
 * (atomic, same directory) to a pid-stamped private working name —
 * `drift_pending_reconcile.claim.<pid>.json` — BEFORE reconciling: the claim is deleted on
 * success and unioned back into the live pending file on failure, so a Stop fire that stages new
 * edits mid-reconcile is never swallowed by the consume. A claim whose pid is dead (a crashed
 * consumer) is unioned back into the pending file on the next launch.
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

export function pending_reconcile_path(store_path: string): string {
  return path.join(path.dirname(store_path), PENDING_RECONCILE_FILE);
}

/** Returns null for absent/malformed input so callers treat it as nothing pending. */
export function parse_pending_reconcile(raw: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed === "object" && parsed !== null && "files" in parsed) {
    const files = parsed.files;
    if (Array.isArray(files) && files.every((f): f is string => typeof f === "string")) {
      return files;
    }
  }
  return null;
}

/** Preserves first-seen order so a retried handoff keeps stable file ordering. */
export function merge_pending_reconcile(prior: readonly string[], current: readonly string[]): string[] {
  return [...new Set([...prior, ...current])];
}

export function serialize_pending_reconcile(files: readonly string[]): string {
  return JSON.stringify({ files });
}

/**
 * Write the staged set via a same-directory temp file + atomic rename. A plain write can be torn
 * by a crash or observed half-written by the concurrent consumer, which parses it as null and
 * silently drops the whole staged union. Atomic against concurrent readers and process crashes;
 * power-loss durability (fsync) is deliberately not promised. Throws on failure so the caller can
 * withhold the transcript watermark and retry the same edits next fire.
 */
export function write_pending_reconcile_atomic(pending_path: string, files: readonly string[]): void {
  fs.mkdirSync(path.dirname(pending_path), { recursive: true });
  const tmp_path = `${pending_path}.${process.pid}.tmp`;
  fs.writeFileSync(tmp_path, serialize_pending_reconcile(files));
  try {
    fs.renameSync(tmp_path, pending_path);
  } catch (err) {
    fs.rmSync(tmp_path, { force: true });
    throw err;
  }
}
