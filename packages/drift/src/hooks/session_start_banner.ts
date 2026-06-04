/**
 * Build the read-only `SessionStart` drift banner. This NEVER reconciles and NEVER mutates anything —
 * it injects a context note reporting two recoverable populations the prior session's reconcile left
 * behind: outstanding relocations (staged `drift_*`, accepted via `reanchor`) and the re-attachment bin
 * (soft-deleted stranded content, recovered via `reattach`). The banner only reads them. It fires when
 * either population is non-empty; both empty produces no banner. A miss-only session — nothing relocated
 * but descriptions binned — still banners, so the bin and `drift.next` are discoverable exactly where
 * they matter.
 */

import type { DriftObservation } from "@code-charter/core";

import type { SessionStartHookOutput } from "./hook_payloads";

export function build_session_start_output(
  drift: readonly DriftObservation[],
  bin_size: number,
): SessionStartHookOutput {
  if (drift.length === 0 && bin_size === 0) {
    return {};
  }

  const lines: string[] = [];
  if (drift.length > 0) {
    lines.push(
      `Code Charter: ${drift.length} node(s) have outstanding drift ` +
        "(a code rename re-synced their diagram; the hand-written description is preserved, awaiting accept):",
    );
    lines.push(
      drift
        .map((d) => `- \`${d.from_symbol_path}\` → \`${d.to_symbol_path}\` (relocated; node \`${d.node_id}\`)`)
        .join("\n"),
    );
    lines.push(
      'Accept a re-anchor with the `drift.resolve` MCP tool (`{ kind: "node", id, resolution: "reanchor" }`).',
    );
  }
  if (bin_size > 0) {
    lines.push(
      `Code Charter: ${bin_size} description(s) are in the re-attachment bin ` +
        "(their symbol was renamed-and-rewritten or removed, so the auto-sync could not re-anchor them).",
    );
  }
  lines.push(
    "Inspect the re-attachment bin with `drift.list` (each entry carries the stranded text and ranked " +
      "candidate targets), step through it one entry at a time with `drift.next`, and restore a binned " +
      "description with `drift.resolve` — bare to its original anchor, or onto a different live symbol via a " +
      "`target` from the candidates.",
  );

  return {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join("\n") },
  };
}
