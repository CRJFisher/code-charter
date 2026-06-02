/**
 * The `Stop`-hook reconcile decision: given the hook payload and the files worked on this turn,
 * decide whether to block-and-instruct the main agent to launch the `drift-reconciler`
 * sub-agent, or to no-op. Two guards keep re-firing safe (AC#3):
 *   1. `stop_hook_active` — Claude is already continuing because of a prior block, so no-op.
 *   2. "no new drift → no-op" — nothing was edited this turn, so there is nothing to reconcile.
 *
 * The reconcile trigger is this hook ALONE: it never reconciles inline and never spawns a
 * process — it hands the changed-file list to the main agent, which launches the registered
 * sub-agent. Scoping reconciliation to only-this-turn across multiple turns (the watermark)
 * lands in task-27.1.6; this substrate ships the block-and-instruct mechanism and its contract.
 */

import type { StopHookInput } from "./hook_payloads";

/** The registered custom sub-agent that performs reconciliation. */
export const RECONCILER_AGENT_NAME = "drift-reconciler";
/** The skill the sub-agent invokes to mutate the store. */
export const DRIFT_SYNC_SKILL_NAME = "drift-sync";

/** A no-op, or a block carrying the instruction + a short user-facing note. */
export type StopDecision =
  | { block: false }
  | { block: true; instruction: string; system_message: string };

/** The instruction fed back to the main agent (the `Stop` output `reason`). */
export function build_reconcile_instruction(worked_on: readonly string[]): string {
  const list = worked_on.map((file_path) => `- ${file_path}`).join("\n");
  return [
    "Code Charter drift detected. Files were edited this turn and their flow diagrams may be stale.",
    `Before ending the turn, launch the \`${RECONCILER_AGENT_NAME}\` sub-agent (via the Task/Agent tool) ` +
      "to reconcile exactly these files, and nothing else:",
    list,
    `The sub-agent invokes the \`${DRIFT_SYNC_SKILL_NAME}\` skill and returns only a brief ` +
      `acknowledgement. Do not reconcile inline yourself; delegate to \`${RECONCILER_AGENT_NAME}\`.`,
  ].join("\n");
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
    instruction: build_reconcile_instruction(worked_on),
    system_message: build_system_message(worked_on.length),
  };
}
