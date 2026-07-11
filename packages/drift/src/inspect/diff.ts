/**
 * The before/after diff of two {@link StoreSummary} projections — the payload `drift-dev` prints
 * after running the deterministic reconcile against a scratch copy of the store. Pure over two already-
 * gathered summaries, so the bin owns the IO (copy the store, reconcile the copy, summarize both) and
 * this owns the comparison. Flows are matched by id; bridges by their `src → dst` endpoints; the
 * description split is compared store-wide.
 *
 * The whole point of the scratch-copy loop is to answer "what would a reconcile of these files DO to
 * the store?" without a Claude session or a token spend — so the diff surfaces the resulting flow
 * inventory (added / retired / re-synced flows, member and bridge deltas), not just an action list.
 */

import type { BridgeSummary, DescriptionBreakdown, FlowSummary, StoreSummary } from "./summary";

/** One flow's change across the reconcile. Exactly one of `before`/`after` is null for add/remove. */
export interface FlowDiff {
  id: string;
  /** The flow before the reconcile, or null when the reconcile hydrated it fresh. */
  before: FlowSummary | null;
  /** The flow after the reconcile, or null when the reconcile dropped it entirely. */
  after: FlowSummary | null;
}

/** The before/after diff of a scratch reconcile: only what changed, plus the store-wide description split. */
export interface SummaryDiff {
  /** Flows that were added, removed, or whose compared fields changed — sorted by id. */
  flows: readonly FlowDiff[];
  /** Bridges gained and lost, keyed by `src → dst`. */
  bridges: { added: readonly BridgeSummary[]; removed: readonly BridgeSummary[] };
  /** Store-wide description-source split on either side (equal when the reconcile changed no text). */
  descriptions: { before: DescriptionBreakdown; after: DescriptionBreakdown };
  /** True when nothing a dev cares about moved — the reconcile is a no-op for these files. */
  unchanged: boolean;
}

function bridge_key(bridge: BridgeSummary): string {
  return `${bridge.src_id} ${bridge.dst_id}`;
}

function breakdowns_equal(a: DescriptionBreakdown, b: DescriptionBreakdown): boolean {
  return (
    a.docstring === b.docstring &&
    a.llm === b.llm &&
    a.provisional === b.provisional &&
    a.placeholder === b.placeholder &&
    a.none === b.none
  );
}

/**
 * Whether two symbol-path lists differ as SETS (membership, order-independent) — a reorder is not a
 * meaningful change. Shared by {@link flow_changed} and the renderer so a flow flagged as changed
 * always renders the dimension that flagged it: the detect predicate and the render predicate are the
 * same function.
 */
export function symbol_lists_differ(before: readonly string[], after: readonly string[]): boolean {
  const before_set = new Set(before);
  const after_set = new Set(after);
  if (before_set.size !== after_set.size) return true;
  for (const symbol of before_set) {
    if (!after_set.has(symbol)) return true;
  }
  return false;
}

/**
 * Whether two states of the same flow differ in any field a dev reconciling deterministically cares
 * about: live/retired, member identity, bridge count, seed identity, or the description split. Member
 * and seed identity (not just count) are compared, so a same-count re-anchor is surfaced rather than
 * read as a no-op. Rationale and `last_synced_at` are excluded — a re-sync always bumps the timestamp,
 * which would flag every flow.
 */
function flow_changed(before: FlowSummary, after: FlowSummary): boolean {
  return (
    before.live !== after.live ||
    before.bridge_count !== after.bridge_count ||
    symbol_lists_differ(before.members, after.members) ||
    symbol_lists_differ(before.seeds, after.seeds) ||
    !breakdowns_equal(before.descriptions, after.descriptions)
  );
}

function collect_flow_diffs(before: StoreSummary, after: StoreSummary): FlowDiff[] {
  const before_by_id = new Map(before.flows.map((flow) => [flow.id, flow]));
  const after_by_id = new Map(after.flows.map((flow) => [flow.id, flow]));
  const ids = [...new Set([...before_by_id.keys(), ...after_by_id.keys()])].sort();

  const diffs: FlowDiff[] = [];
  for (const id of ids) {
    const b = before_by_id.get(id) ?? null;
    const a = after_by_id.get(id) ?? null;
    if (b === null || a === null) {
      diffs.push({ id, before: b, after: a });
    } else if (flow_changed(b, a)) {
      diffs.push({ id, before: b, after: a });
    }
  }
  return diffs;
}

function collect_bridge_diffs(
  before: StoreSummary,
  after: StoreSummary,
): { added: BridgeSummary[]; removed: BridgeSummary[] } {
  const before_keys = new Set(before.bridges.map(bridge_key));
  const after_keys = new Set(after.bridges.map(bridge_key));
  return {
    added: after.bridges.filter((bridge) => !before_keys.has(bridge_key(bridge))),
    removed: before.bridges.filter((bridge) => !after_keys.has(bridge_key(bridge))),
  };
}

/** Diff two store summaries into the before/after change set `drift-dev` renders. */
export function diff_summaries(before: StoreSummary, after: StoreSummary): SummaryDiff {
  const flows = collect_flow_diffs(before, after);
  const bridges = collect_bridge_diffs(before, after);
  const descriptions = { before: before.descriptions, after: after.descriptions };
  const unchanged =
    flows.length === 0 &&
    bridges.added.length === 0 &&
    bridges.removed.length === 0 &&
    breakdowns_equal(descriptions.before, descriptions.after);
  return { flows, bridges, descriptions, unchanged };
}
