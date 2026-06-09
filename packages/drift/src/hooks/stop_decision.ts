/**
 * The `Stop`-hook reconcile decision: given the hook payload and the files worked on this turn,
 * decide whether to block-and-instruct the main agent to launch the `drift-reconciler`
 * sub-agent, or to no-op. Two guards keep re-firing safe (AC#3):
 *   1. `stop_hook_active` — Claude is already continuing because of a prior block, so no-op.
 *   2. "no new drift → no-op" — nothing was edited this turn, so there is nothing to reconcile.
 *
 * The reconcile trigger is this hook ALONE: it never reconciles inline and never spawns a
 * process — the bin stages the changed-file set in the pending file beside the store, and the
 * instruction tells the main agent only to launch the registered sub-agent (the file list never
 * enters the main agent's context). The downstream chain is: main agent → `drift-reconciler`
 * (assets/agents) → `drift-sync` skill → `drift_sync.js` (which fetches and consumes the pending
 * set) → bin/`drift_reconcile.ts` → the reconcile engine (task-27.1.6). Re-firing is safe because
 * the engine's writes are idempotent and go through SQLite (not Edit/Write), so they never re-arm
 * this hook.
 *
 * `worked_on` is the files edited *this turn* — the bin scopes it to edits since the previous Stop via
 * the transcript watermark ({@link worked_on_since}). That is what makes guard 2 satisfiable: once a
 * turn's edits are handed off, an idle turn yields an empty set and no-ops. (Without the watermark the
 * set would be the whole session's cumulative edits and the hook would re-fire forever.)
 */

import type { StopHookInput } from "./hook_payloads";

/** The registered custom sub-agent that performs reconciliation. */
export const RECONCILER_AGENT_NAME = "drift-reconciler";

/** A no-op, or a block carrying the instruction + a short user-facing note. */
export type StopDecision =
  | { block: false }
  | { block: true; instruction: string; system_message: string };

/**
 * The instruction fed back to the main agent (the `Stop` output `reason`). It deliberately names no
 * files: the changed-file set is staged in the pending file and fetched by the sub-agent's script,
 * so the list never pollutes the main agent's context.
 */
export function build_reconcile_instruction(): string {
  return `Launch the \`${RECONCILER_AGENT_NAME}\` sub-agent.`;
}

/** The short user-facing note (the `Stop` output `systemMessage`). */
export function build_system_message(count: number): string {
  return `Code Charter: reconciling diagrams for ${count} changed file(s) via ${RECONCILER_AGENT_NAME}.`;
}

export function decide_stop_action(input: StopHookInput, worked_on: readonly string[]): StopDecision {
  if (input.stop_hook_active === true) {
    return { block: false };
  }
  if (worked_on.length === 0) {
    return { block: false };
  }
  return {
    block: true,
    instruction: build_reconcile_instruction(),
    system_message: build_system_message(worked_on.length),
  };
}
