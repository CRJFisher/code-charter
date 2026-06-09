/**
 * Build the read-only `SessionStart` drift banner. This NEVER reconciles and NEVER mutates anything —
 * it injects a context note reporting the outstanding relocations the prior session's reconcile left
 * behind: staged `drift_*` re-anchors a code rename produced, accepted via `reanchor`. The banner only
 * reads them, and fires only when there is outstanding drift.
 */

import type { DriftObservation } from "@code-charter/core";

import type { SessionStartHookOutput } from "./hook_payloads";

export function build_session_start_output(drift: readonly DriftObservation[]): SessionStartHookOutput {
  if (drift.length === 0) {
    return {};
  }

  const lines: string[] = [];
  lines.push(
    `Code Charter: ${drift.length} node(s) have outstanding drift ` +
      "(a code rename re-synced their diagram; the description is preserved, awaiting accept):",
  );
  lines.push(
    drift
      .map((d) => `- \`${d.from_symbol_path}\` → \`${d.to_symbol_path}\` (relocated; node \`${d.node_id}\`)`)
      .join("\n"),
  );
  lines.push(
    'Accept a re-anchor with the `drift.resolve` MCP tool (`{ kind: "node", id, resolution: "reanchor" }`).',
  );

  return {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join("\n") },
  };
}
