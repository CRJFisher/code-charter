/**
 * The vscode-agnostic drift status logic: the status-bar view state derived from whether the Stop hook
 * is armed, and the OutputChannel rendering of the persisted sync-status record. Kept free of the
 * `vscode` API so it is unit-testable without a host mock; `extension.ts` maps {@link DriftBarState}
 * onto a real `StatusBarItem` and prints {@link format_sync_status} into the channel.
 */

import type { SyncStatus } from "@code-charter/drift";

/** The command the status-bar item and OutputChannel share, so a "click to fix" re-runs the install. */
export const INSTALL_DRIFT_COMMAND = "code-charter-vscode.installDrift";

/** A view of the status bar: its label, hover, and whether to flag it as needing attention. */
export interface DriftBarState {
  text: string;
  tooltip: string;
  /** True → render on the warning background and route the click to the install command. */
  warn: boolean;
}

export function drift_bar_state(hook_installed: boolean): DriftBarState {
  return hook_installed
    ? {
        text: "$(sync) Drift armed",
        tooltip: "The drift Stop hook is installed in this workspace — Claude Code sessions keep the diagram in sync.",
        warn: false,
      }
    : {
        text: "$(warning) Drift NOT installed",
        tooltip: "The drift Stop hook is missing from this workspace. Click to install it.",
        warn: true,
      };
}

/**
 * Render the persisted sync-status (the `.3` health record beside the store) as a human line for the
 * OutputChannel. `last_error !== null` always means the most recent reconcile FAILED; an attempt newer
 * than the last success with no error means a run was interrupted or is in flight; otherwise the repo
 * is in sync. A record with every field null has never reconciled.
 */
export function format_sync_status(status: SyncStatus): string {
  if (status.last_attempt_at === null && status.last_success_at === null && status.last_error === null) {
    return "Drift sync: no reconcile recorded yet for this workspace.";
  }
  const lines = ["Drift sync status:"];
  lines.push(`  last success: ${status.last_success_at ?? "never"}`);
  lines.push(`  last attempt: ${status.last_attempt_at ?? "never"}`);
  if (status.last_error !== null) {
    lines.push(`  UNHEALTHY — last reconcile failed at ${status.last_error.at}: ${status.last_error.message}`);
  } else if (
    status.last_attempt_at !== null &&
    (status.last_success_at === null || status.last_attempt_at > status.last_success_at)
  ) {
    lines.push("  a reconcile is in flight or was interrupted (attempt newer than success, no error).");
  } else {
    lines.push("  healthy — the last reconcile succeeded.");
  }
  return lines.join("\n");
}
