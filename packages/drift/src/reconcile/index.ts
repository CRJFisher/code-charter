/**
 * The reconcile engine: the body of the `drift-sync` skill (task-27.1.6). Public surface for the
 * `drift-reconcile` bin and for tests.
 */

export { reconcile } from "./reconcile";
export { make_ariadne_adapter } from "./ariadne_adapter";
export type { AriadneAdapter } from "./ariadne_adapter";
export { HeadlessProject, is_supported_source } from "./headless_project";
export { find_skill_root, ingest_skill_dir } from "./skill_dir";
export { affected_persisted_flows } from "./affected_flows";
export { read_persisted_flow, read_persisted_flows, write_flow } from "./flow_store";
export type { PersistedFlow, WriteFlowArgs } from "./flow_store";
export { anchor_set_hash, match_existing_flow, REMAP_OVERLAP_THRESHOLD } from "./flow_identity";
export type { FlowMatch } from "./flow_identity";
export { hydrate_code_flow, hydrate_skill_flow } from "./hydrate";
export type { CodeUmbrella, SkillUmbrella, Umbrella } from "./hydrate";
export { resolve_descriptions, null_describe_executor } from "./describe";
export { to_abs, to_repo_relative } from "./paths";
export { read_only_store } from "./dry_run_store";
export type { DescribeBatchExecutor } from "./describe";
export type { DetectionGoal, FlowAction, FlowOutcome, ReconcileDeps, ReconcileResult } from "./types";
