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

// Installer
export { install_drift, build_hook_specs, hook_command } from "./installer/install";
export { resolve_db_path } from "./hooks/resolve_db_path";
export {
  merge_all_hooks,
  merge_hook_entry,
  hook_group_is_ours,
  read_hook_groups,
} from "./installer/merge_settings";
export {
  CLAUDE_CODE_LAYOUT,
  HOST_LAYOUTS,
  build_hook_group,
} from "./installer/host_layout";
export type { HostLayout, HostKey, HookArtifactSpec } from "./installer/host_layout";
