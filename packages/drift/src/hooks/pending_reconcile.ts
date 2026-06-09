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

/** Lives beside the store and the Stop watermark. Mirrored in `drift_sync.js`. */
export const PENDING_RECONCILE_FILE = "drift_pending_reconcile.json";

export function pending_reconcile_path(store_path: string): string {
  return path.join(path.dirname(store_path), PENDING_RECONCILE_FILE);
}

/** Parse a staged set, or null when absent/malformed (treated as nothing pending). */
export function parse_pending_reconcile(raw: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as Record<string, unknown>).files) &&
      ((parsed as Record<string, unknown>).files as unknown[]).every((f) => typeof f === "string")
    ) {
      return (parsed as { files: string[] }).files;
    }
  } catch {
    /* malformed → nothing pending */
  }
  return null;
}

/** Union an unconsumed prior set with this turn's set, preserving first-seen order. */
export function merge_pending_reconcile(prior: readonly string[], current: readonly string[]): string[] {
  return [...new Set([...prior, ...current])];
}

export function serialize_pending_reconcile(files: readonly string[]): string {
  return JSON.stringify({ files });
}
