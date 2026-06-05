/**
 * task-27.1.6.4 AC#1 — the turn-level symbol change set.
 *
 * `compute_symbol_delta` reduces a turn's edits to a structured, symbol-level delta: which symbols were
 * added, removed, body-modified, or relocated. It is the aggregate promotion of the per-anchor verdicts
 * `resolve_anchor` already computes — the same cascade `re_extract` runs node-by-node for description
 * preservation, surfaced here as one change set keyed by `symbol_path`.
 *
 * It diffs the FRESH resolver index of the changed files against the store's PERSISTED ANCHORS (each
 * preserved node's `symbol_path:content_hash`):
 *   - a baseline anchor whose body changed under a stable path → `modified`
 *   - a baseline anchor whose body now lives at a new path      → `relocated`
 *   - a baseline anchor that resolves nowhere                    → `removed`
 *   - a fresh symbol_path with no baseline anchor                → `added`
 *
 * Purity: no store, no logging, no parser. `added` is correct only when `index` is built over the
 * changed files alone (a whole-repo index would flood it); the production adapter scopes `build_index`
 * to the changed file set, so this holds.
 *
 * `added` is relative to ANCHORED knowledge: an undescribed code symbol has no persisted anchor and so
 * reads as `added`. That is harmless — downstream re-sync/re-describe is scoped through flows (a symbol
 * in no flow drives no work), and it is the membership-diff re-sync trigger, not `added`, that pulls a
 * new member into the flow it joined.
 */

import { resolve_anchor } from "../resolver";
import type { ResolverIndex } from "../resolver";

/** A symbol whose body is unchanged but now lives at a different `symbol_path` (a rename or move). */
export interface RelocatedSymbol {
  from: string;
  to: string;
}

/** The structured, symbol-level change set for a turn's edits (AC#1). All buckets keyed by `symbol_path`. */
export interface SymbolDelta {
  /**
   * Fresh symbol_paths with no baseline anchor (relocation targets excluded). NOTE: "added" is relative
   * to ANCHORED knowledge, not to "code the user just wrote" — an existing-but-undescribed symbol has no
   * persisted anchor and so reads as `added`. Harmless: downstream work is scoped through flows.
   */
  added: string[];
  /** Baseline symbol_paths that resolve nowhere in the fresh code (a `miss`). */
  removed: string[];
  /** Baseline symbol_paths present at the same path with a changed body (`body-changed`). */
  modified: string[];
  /** Baseline symbol_paths whose body moved to a new path (the resolver's `relocated` verdict). */
  relocated: RelocatedSymbol[];
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Diff the fresh `index` against the `baseline` (`symbol_path → content_hash`, from persisted anchors).
 * Deterministic: every bucket is sorted. See the module docstring for the classification.
 */
export function compute_symbol_delta(baseline: ReadonlyMap<string, string>, index: ResolverIndex): SymbolDelta {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  const relocated: RelocatedSymbol[] = [];
  const relocation_targets = new Set<string>();

  for (const [symbol_path, content_hash] of baseline) {
    const result = resolve_anchor({ symbol_path, content_hash }, index);
    if (result.status === "hit") continue;
    if (result.status === "miss") {
      removed.push(symbol_path);
      continue;
    }
    if (result.reason === "body-changed") {
      modified.push(symbol_path);
    } else {
      relocated.push({ from: symbol_path, to: result.state.symbol_path });
      relocation_targets.add(result.state.symbol_path);
    }
  }

  // added = fresh symbol_paths with no baseline anchor, minus relocation targets — a relocated symbol's
  // new path is fresh-but-unbaselined, but it is already reported as the `to` of a relocation.
  for (const symbol_path of index.by_symbol_path.keys()) {
    if (!baseline.has(symbol_path) && !relocation_targets.has(symbol_path)) added.push(symbol_path);
  }

  added.sort(cmp);
  removed.sort(cmp);
  modified.sort(cmp);
  relocated.sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to));
  return { added, removed, modified, relocated };
}
