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
 * Per-turn tally of description writes by source. The deterministic pass produces `docstring`,
 * `provisional` (a name stand-in for a member awaiting the agent's real text), and terminal
 * `placeholder` (an over-cap member that stays a name); `llm` counts arrive through
 * `--apply-descriptions` (the agent's upgrade pass). A turn's `provisional` count is exactly how many
 * members are still awaiting real text if `--apply-descriptions` never runs.
 */
export interface DescriptionCounts {
  docstring: number;
  /** A `needs_llm` member written with its name, awaiting overwrite by `--apply-descriptions`. */
  provisional: number;
  placeholder: number;
  llm: number;
}

/** A retirement the graph-health guard skipped this run, retried naturally on the next turn. */
export interface DeferredRetirement {
  flow_id: string;
  reason: string;
}

/**
 * A skill-bundle re-sync the partial-write guard skipped this run: the bundle looked degraded on disk
 * (an unreadable/empty SKILL.md, or a declared sub-agent file missing), so the good flow is left
 * intact rather than overwritten with a shrunken snapshot. Retried naturally on the next turn that
 * touches the bundle, exactly like {@link DeferredRetirement}.
 */
export interface DeferredSkillSync {
  flow_id: string;
  reason: string;
}

export interface ReconcileResult {
  file_set: readonly string[];
  outcomes: FlowOutcome[];
  /** Retirements deferred because the graph looked untrustworthy for the flow's seed — an empty call graph, or a seed file that failed to index. */
  deferred_retirements: DeferredRetirement[];
  /** Skill re-syncs deferred because the bundle looked degraded on disk (truncated SKILL.md, missing sub-agent file). */
  deferred_skill_syncs: DeferredSkillSync[];
  /** Aggregate describe-source split across this turn's hydrations and re-syncs. */
  description_counts: DescriptionCounts;
}
