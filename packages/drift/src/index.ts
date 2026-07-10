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
// Read a store path into the InspectInput collect_store_summary folds — the .5 OutputChannel and the
// dev-mode Dump Drift Store command (.8) render a store summary in-process off this.
export { read_inspect_input } from "./inspect/read_input";
// The run-log readers + types a consumer needs to build an InspectInput off a store path.
export {
  read_latest_reconcile_record,
  read_sync_status,
  sync_status_path,
  RECONCILE_RECORD_SCHEMA_VERSION,
} from "./reconcile/reconcile_log";
export type { ReconcileRunRecord, ReconcileRunDetail, ReconcileMode, SyncStatus } from "./reconcile/reconcile_log";
// The transcript-join derivation (docs/contracts/reconcile_run_record.md) for trajectory readers.
export { derive_transcript_path, slugify_claude_project_dir } from "./hooks/transcript_path";
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
// The trajectory spine (docs/contracts/trajectory_spine.md): neutral schema + renderer for any
// spine consumer (.17 grading queue), and the drift-aware extractor for in-process producers.
export { SPINE_SCHEMA_VERSION } from "./inspect/trajectory_schema";
export type { AvailabilityTier, SpineStep, SpineStepKind, TrajectorySpine } from "./inspect/trajectory_schema";
export { render_trajectory } from "./inspect/trajectory_render";
export { extract_trajectory_spine, build_trajectory_spine } from "./inspect/trajectory_extract";
export { read_reconcile_record_by_run_id } from "./reconcile/reconcile_log";

// Installer
export { install_drift, is_stop_hook_installed, STOP_HOOK_IDENTITY_TOKEN } from "./installer/install";
export { resolve_db_path } from "./hooks/resolve_db_path";
export {
  CLAUDE_CODE_LAYOUT,
  HOST_LAYOUTS,
  build_hook_group,
} from "./installer/host_layout";
export type { HostLayout, HostKey, HookArtifactSpec } from "./installer/host_layout";
