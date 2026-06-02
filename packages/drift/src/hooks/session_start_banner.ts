/**
 * Build the read-only `SessionStart` outstanding-drift banner. This NEVER reconciles and NEVER
 * mutates anything — it injects a context note listing files that have drifted, pointing the
 * user at `/drift` or the `drift.list` MCP tool. An empty drift list produces no banner.
 */

import type { SessionStartHookOutput } from "./hook_payloads";

export function build_session_start_output(drifted_files: readonly string[]): SessionStartHookOutput {
  if (drifted_files.length === 0) {
    return {};
  }
  const list = drifted_files.map((file_path) => `- ${file_path}`).join("\n");
  const additional_context = [
    `Code Charter: ${drifted_files.length} file(s) have outstanding drift ` +
      "(changed since last reconcile):",
    list,
    "Their flow diagrams re-sync when you next work on them. To reconcile now run `/drift`, " +
      "or inspect the re-attachment bin with the `drift.list` MCP tool.",
  ].join("\n");
  return {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: additional_context },
  };
}
