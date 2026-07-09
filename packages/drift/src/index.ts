/**
 * Public API of `@code-charter/drift`: the hook decision functions, the reconcile engine, and the
 * host-keyed installer. The bin entries under `bin/` are the executable surfaces the installer
 * wires into a host.
 */

// Hooks
export { decide_stop_action, build_reconcile_instruction, RECONCILER_AGENT_NAME } from "./hooks/stop_decision";
export type { StopDecision } from "./hooks/stop_decision";
export { parse_worked_on_files } from "./hooks/transcript_parser";

// Reconcile engine (task-27.1.6 — the drift-sync skill body)
export { reconcile, make_ariadne_adapter, HeadlessProject } from "./reconcile";
export type { AriadneAdapter, DeferredRetirement, FlowAction, FlowOutcome, ReconcileDeps, ReconcileResult } from "./reconcile";

// Store inspection (task-27.1.20.4 — reused by the OutputChannel (.5) and drift:dev (.7))
export {
  collect_flow_detail,
  collect_store_summary,
  count_proposed_bridges,
  detect_anomalies,
} from "./inspect/summary";
// The run-log readers + types a consumer needs to build an InspectInput off a store path.
export { read_latest_reconcile_record, read_sync_status, sync_status_path } from "./reconcile/reconcile_log";
export type { ReconcileLogRecord, ReconcileMode, SyncStatus } from "./reconcile/reconcile_log";
export type {
  Anomaly,
  BridgeSummary,
  DescriptionBreakdown,
  FlowDetail,
  FlowSummary,
  InspectInput,
  MemberDescription,
  StoreSummary,
} from "./inspect/summary";
export { render_anomalies, render_flow_detail, render_summary } from "./inspect/render";

// Installer
export { install_drift, is_stop_hook_installed, STOP_HOOK_IDENTITY_TOKEN } from "./installer/install";
export { resolve_db_path } from "./hooks/resolve_db_path";
export {
  CLAUDE_CODE_LAYOUT,
  HOST_LAYOUTS,
  build_hook_group,
} from "./installer/host_layout";
export type { HostLayout, HostKey, HookArtifactSpec } from "./installer/host_layout";
