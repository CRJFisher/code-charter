/**
 * Shared contracts for the reconcile engine: the injected dependencies and the per-flow outcome the
 * dispatch reports back (serialized to the `drift-sync` `--json` records).
 */

import type { GraphStore } from "@code-charter/core";

import type { AriadneAdapter } from "./ariadne_adapter";

/** v1's single detection goal. Open union so a later goal is an added value. */
export type DetectionGoal = "orient-in-code-tree" | (string & {});

export interface ReconcileDeps {
  store: GraphStore;
  adapter: AriadneAdapter;
  /** Absolute repo root (Ariadne is keyed on absolute paths; the transcript hands absolute paths too). */
  repo_root_abs: string;
  /** Repo-relative prefix; leaves outside it bucket under `<external>` in the scaffold. */
  analyzed_root: string;
  /** Defaults to `orient-in-code-tree` when omitted. */
  goal?: DetectionGoal;
  /** Injected clock → ISO-8601, so `last_synced_at` is deterministic in tests. */
  now: () => string;
  /** Diagnostics sink (stderr in the bin; a collector in tests). */
  log: (message: string) => void;
}

export type FlowAction = "hydrate" | "resync" | "retire";

/** One flow's reconcile result — the unit the `drift-sync` dispatch records carry. */
export interface FlowOutcome {
  flow_id: string;
  action: FlowAction;
  kind: "skill" | "code";
  member_count: number;
  last_synced_at: string | null;
  /**
   * Why the action fired — the durable answer to "why did flow X get retired/re-synced?".
   * Prose for display, not a code to branch on.
   */
  reason: string;
}

/**
 * Per-turn tally of description writes by source. The deterministic pass produces only `docstring`
 * and `placeholder`; `llm` counts arrive through `--apply-descriptions` (the agent's upgrade pass),
 * so a turn's placeholder-vs-llm split reveals how much of the store is still awaiting real text.
 */
export interface DescriptionCounts {
  docstring: number;
  placeholder: number;
  llm: number;
}

/** A retirement the graph-health guard skipped this run, retried naturally on the next turn. */
export interface DeferredRetirement {
  flow_id: string;
  reason: string;
}

export interface ReconcileResult {
  file_set: readonly string[];
  outcomes: FlowOutcome[];
  /** Retirements deferred because the graph looked untrustworthy for the flow's seed — an empty call graph, or a seed file that failed to index. */
  deferred_retirements: DeferredRetirement[];
  /** Aggregate describe-source split across this turn's hydrations and re-syncs. */
  description_counts: DescriptionCounts;
}
