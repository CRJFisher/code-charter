/**
 * The neutral trajectory spine (docs/contracts/trajectory_spine.md; decision-10 rule 3): four
 * step kinds with generic fields at the top level and every drift-specific payload under
 * `detail`. This module imports nothing and names the boundary between drift-aware extraction
 * (trajectory_extract.ts) and neutral rendering (trajectory_render.ts) — the renderer and the
 * .17 grading queue consume ONLY the fields declared here, never a `detail` shape.
 */

export const SPINE_SCHEMA_VERSION = 1;

export type SpineStepKind = "instruction" | "context" | "judgement" | "effect";

export interface SpineStep {
  kind: SpineStepKind;
  /** 0-based, gap-free index over the spine's canonical order — the consumer's iteration key. */
  ordinal: number;
  /** Wall-clock time when known (context steps only); advisory, never monotonic across kinds. */
  at: string | null;
  /** The fully-composed human-renderable line — the load-bearing neutral field. */
  summary: string;
  /** Drift payload; opaque to every neutral consumer. */
  detail: Record<string, unknown>;
}

export type AvailabilityTier =
  | "no_session"
  | "path_not_recorded"
  | "file_missing"
  | "no_reconciler_span"
  | "subagent_file_missing";

export interface TrajectorySpine {
  schema_version: number;
  run_id: string;
  session_id: string | null;
  timestamp: string;
  /** False whenever context steps could not be reconstructed — a first-class state, not an error. */
  transcript_available: boolean;
  /** "" when available; else the one-line marker the renderer prints verbatim. */
  availability_note: string;
  steps: readonly SpineStep[];
  /** Drift envelope payload: { mode, availability_tier?, notes: string[] }. */
  detail: Record<string, unknown>;
}
