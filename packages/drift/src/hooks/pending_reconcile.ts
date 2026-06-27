/**
 * The pending-reconcile handoff file: how the `Stop` hook hands the changed-file set to the
 * `drift-reconciler` sub-agent WITHOUT routing the list through the main agent's context. The hook
 * bin stages the set here (beside the store, so it is per-repo and shares the gitignored
 * `.code-charter/`); the `drift-sync` bundled script fetches and consumes it. Paths are
 * repo-relative forward-slash — the store's path space and the reconcile bin's `--files` contract.
 *
 * Staging UNIONS with any unconsumed prior set: the script deletes the file only after a
 * successful reconcile, so a declined or failed handoff is retried with the next turn's set
 * instead of being overwritten.
 *
 * The format is duplicated (by necessity) in `assets/skills/drift-sync/scripts/drift_sync.js`,
 * which runs standalone from an installed `.claude` directory and cannot import this module.
 */

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
