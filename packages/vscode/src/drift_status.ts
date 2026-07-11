/**
 * The vscode-agnostic drift status logic: the status-bar view state derived from whether the Stop hook
 * is armed, the OutputChannel rendering of the persisted sync-status record, and the dev-mode reconcile
 * preview rendering. Kept free of the `vscode` API so it is unit-testable without a host mock;
 * `extension.ts` maps {@link DriftBarState} onto a real `StatusBarItem` and prints
 * {@link format_sync_status} / {@link format_preview_outcomes} into the channel.
 */

import type { FlowOutcome, SyncStatus } from "@code-charter/drift";

/** The command the status-bar item and OutputChannel share, so a "click to fix" re-runs the install. */
export const INSTALL_DRIFT_COMMAND = "code-charter-vscode.installDrift";

/** The dev-mode command that previews a deterministic reconcile of the current diff into the channel. */
export const PREVIEW_DRIFT_COMMAND = "code-charter-vscode.previewDriftReconcile";

/** The dev-mode command that renders the persisted drift store's summary into the channel on demand. */
export const DUMP_DRIFT_STORE_COMMAND = "code-charter-vscode.dumpDriftStore";

/** The context key the command palette gates {@link PREVIEW_DRIFT_COMMAND} on, set from dev mode on activation. */
export const DEV_MODE_CONTEXT_KEY = "code-charter-vscode.devMode";

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
 * Render the persisted sync-status (the health record beside the store) as a human line for the
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

/**
 * Render the would-be outcomes of a dry-run reconcile (the `drift-reconcile --dry-run --json` result)
 * as OutputChannel lines. Each outcome is one action the deterministic reconcile WOULD take against the
 * store for the current diff — hydrate / re-sync / retire — with no store mutation and no token spend.
 * An empty list means the diff drives no flow change.
 */
export function format_preview_outcomes(outcomes: readonly FlowOutcome[]): string {
  const lines = ["Drift reconcile preview (dry run — no store mutation, no tokens):"];
  if (outcomes.length === 0) {
    lines.push("  no flows would change for the current diff.");
    return lines.join("\n");
  }
  for (const outcome of outcomes) {
    lines.push(
      `  ${outcome.action} ${outcome.flow_id} (${outcome.kind}, ${outcome.member_count} member(s)) — ${outcome.reason}`,
    );
  }
  return lines.join("\n");
}
