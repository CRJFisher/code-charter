/**
 * Public API of `@code-charter/drift`: the MCP server builder + pure `drift.*` handlers, the
 * hook decision functions, and the host-keyed installer. The bin entries under `bin/` are the
 * executable surfaces the installer wires into a host.
 */

// MCP surface
export { build_drift_server } from "./mcp/build_drift_server";
export { drift_list, drift_resolve } from "./mcp/drift_tool";
export type { DriftResolution, DriftResolveResult, DriftToolContext } from "./mcp/drift_tool";
export { re_attachment_bin } from "./mcp/re_attachment_bin";
export type { DriftBinEntry } from "./mcp/re_attachment_bin";
export { make_append_logger, now_iso } from "./mcp/call_log";
export type { DriftCallLogEntry, LogCall } from "./mcp/call_log";
export { resolve_db_path } from "./mcp/resolve_db_path";
export { DRIFT_SERVER_NAME, TOOL_DRIFT_LIST, TOOL_DRIFT_RESOLVE } from "./mcp/tool_names";

// Hooks
export { decide_stop_action, build_reconcile_instruction, RECONCILER_AGENT_NAME } from "./hooks/stop_decision";
export type { StopDecision } from "./hooks/stop_decision";
export { parse_worked_on_files, EDIT_TOOL_NAMES } from "./hooks/transcript_parser";
export { build_session_start_output } from "./hooks/session_start_banner";

// Reconcile engine (task-27.1.6 — the drift-sync skill body)
export { reconcile, make_ariadne_adapter, HeadlessProject } from "./reconcile";
export type { AriadneAdapter, FlowOutcome, ReconcileDeps, ReconcileResult } from "./reconcile";

// Installer
export { install_drift, build_hook_specs, hook_command, DRIFT_MCP_SERVER_NAME } from "./installer/install";
export {
  merge_all_hooks,
  merge_hook_entry,
  merge_mcp_server,
  hook_group_is_ours,
  read_hook_groups,
  read_mcp_server,
} from "./installer/merge_settings";
export {
  CLAUDE_CODE_LAYOUT,
  HOST_LAYOUTS,
  build_hook_group,
} from "./installer/host_layout";
export type { HostLayout, HostKey, HookArtifactSpec } from "./installer/host_layout";
