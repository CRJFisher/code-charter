/**
 * The neutral spine renderer — the render side of the boundary named in trajectory_schema.ts.
 * It imports ONLY the neutral schema module (pinned by the import-boundary test) and reads only
 * the neutral fields (`kind`, `ordinal`, `summary`, the envelope): rendering a spine must need
 * zero drift knowledge, because the .17 grading queue renders the same shape blind.
 */

import type { SpineStep, SpineStepKind, TrajectorySpine } from "./trajectory_schema";

const SECTION_ORDER: readonly SpineStepKind[] = ["instruction", "context", "judgement", "effect"];

export function render_trajectory(spine: TrajectorySpine): string[] {
  const lines: string[] = [];
  lines.push(`trajectory ${spine.run_id}  session=${spine.session_id ?? "(none)"}  completed=${spine.timestamp}`);
  if (!spine.transcript_available) {
    lines.push(`  ${spine.availability_note} — effect-only view`);
  }
  const by_kind = new Map<SpineStepKind, SpineStep[]>();
  for (const step of [...spine.steps].sort((a, b) => a.ordinal - b.ordinal)) {
    const bucket = by_kind.get(step.kind) ?? [];
    bucket.push(step);
    by_kind.set(step.kind, bucket);
  }
  for (const kind of SECTION_ORDER) {
    const steps = by_kind.get(kind) ?? [];
    lines.push("");
    lines.push(`${kind} (${steps.length}):`);
    for (const step of steps) {
      for (const summary_line of step.summary.split("\n")) {
        lines.push(`  ${summary_line}`);
      }
    }
  }
  return lines;
}
