/**
 * Build the read-only `SessionStart` outstanding-drift banner. This NEVER reconciles and NEVER
 * mutates anything — it injects a context note reporting the outstanding drift count and each
 * drifted node as a punch-list item, pointing the user at `drift.resolve`. The drift was staged
 * out-of-band by the prior session's reconcile (`re_extract`); the banner only reads it. An empty
 * drift list produces no banner.
 */

import type { DriftObservation } from "@code-charter/core";

import type { SessionStartHookOutput } from "./hook_payloads";

export function build_session_start_output(drift: readonly DriftObservation[]): SessionStartHookOutput {
  if (drift.length === 0) {
    return {};
  }
  const list = drift
    .map((d) => `- \`${d.from_symbol_path}\` → \`${d.to_symbol_path}\` (relocated; node \`${d.node_id}\`)`)
    .join("\n");
  const additional_context = [
    `Code Charter: ${drift.length} node(s) have outstanding drift ` +
      "(a code rename re-synced their diagram; the hand-written description is preserved, awaiting accept):",
    list,
    'Accept a re-anchor with the `drift.resolve` MCP tool (`{ id, resolution: "reanchor" }`), ' +
      "or inspect the re-attachment bin with `drift.list`.",
  ].join("\n");
  return {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: additional_context },
  };
}
