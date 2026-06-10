/**
 * Shared contracts for the reconcile engine: the injected dependencies and the per-flow outcome the
 * dispatch reports back (serialized to the `drift-sync` `--json` records).
 */

import type { DescribeBatchExecutor, DetectionGoal, EntrypointStitchExecutor, GraphStore } from "@code-charter/core";

import type { AriadneAdapter } from "./ariadne_adapter";

export type { DetectionGoal };

export interface ReconcileDeps {
  store: GraphStore;
  adapter: AriadneAdapter;
  /** Absolute repo root (Ariadne is keyed on absolute paths; the transcript hands absolute paths too). */
  repo_root_abs: string;
  /** Repo-relative prefix; leaves outside it bucket under `<external>` in the scaffold. */
  analyzed_root: string;
  /** The describe-step model call. Defaults to the deterministic `null_describe_executor`. */
  describe?: DescribeBatchExecutor;
  /** The entrypoint-stitch model call. Defaults to the deterministic `null_stitch_executor`. */
  stitch_entrypoints?: EntrypointStitchExecutor;
  /** Detection goal. Defaults to `orient-in-code-tree`. */
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
}
