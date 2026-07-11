/**
 * Public API of `@code-charter/drift`, consumed by the code-charter vscode extension: store-summary
 * inspection, the persisted sync-status reader, and the host-keyed `.claude` installer. The drift
 * bins and internal modules import their sources directly, so this barrel states only the surface
 * crossed at the package boundary.
 */

export type { FlowOutcome } from "./reconcile";

export { collect_store_summary } from "./inspect/summary";
export { read_inspect_input } from "./inspect/read_input";
export { render_summary } from "./inspect/render";

export { read_sync_status } from "./reconcile/reconcile_log";
export type { SyncStatus } from "./reconcile/reconcile_log";

export { install_drift, is_stop_hook_installed } from "./installer/install";
export { HOST_LAYOUTS } from "./installer/host_layout";
