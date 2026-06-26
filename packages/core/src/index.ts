import { createRequire } from "node:module";

import type { GraphStore } from "@code-charter/types";

import { NullGraphStore } from "./storage/null_graph_store";
import { current_node_version, is_node_sqlite_supported } from "./storage/node_sqlite_support";

const require_module = createRequire(__filename);

/**
 * Open the graph store for `db_path`, choosing the engine by host capability.
 *
 * On a host with the built-in SQLite engine this returns a {@link SqliteGraphStore}; on an
 * older or non-Node host it returns a degraded {@link NullGraphStore}, never throwing. The
 * real store is loaded lazily so the SQLite engine is never imported on unsupported hosts.
 */
export function open_graph_store(db_path: string): GraphStore {
  if (!is_node_sqlite_supported(current_node_version())) {
    return new NullGraphStore();
  }
  const module = require_module("./storage/sqlite_graph_store") as typeof import("./storage/sqlite_graph_store");
  return new module.SqliteGraphStore(db_path);
}

export { CustomGraphModel, graph_to_rows } from "./model/custom_graph_model";
export type { CustomGraph } from "./model/custom_graph_model";
export { NullGraphStore } from "./storage/null_graph_store";
export { current_node_version, is_node_sqlite_supported, MIN_NODE_SQLITE_VERSION } from "./storage/node_sqlite_support";
export { CURRENT_SCHEMA_VERSION } from "./storage/schema";
// The contract types a consumer needs to drive the model's public API (render/write_fields/upsert/...),
// re-exported so they are reachable from one entry point alongside CustomGraphModel.
export type {
  EdgeRow,
  GraphStore,
  GraphTarget,
  LayerSpec,
  NodeRow,
  ProvenanceRow,
  Tier,
} from "@code-charter/types";

// task-27.0.3 — the reusable anchor resolver
export {
  anchored_symbols_from_ariadne,
  build_resolver_index,
  build_symbol_path,
  derive_code_state,
  format_anchor,
  parse_anchor,
  resolve_anchor,
  resolver_symbols_from_ariadne,
} from "./resolver";
export type {
  AnchoredSymbol,
  AriadneFileInput,
  ResolverIndex,
  ResolverSymbol,
} from "./resolver";

// task-27.1.2 AC#9 — the deterministic file-module first-parent tier
export {
  build_module_scaffold,
  EXTERNAL_GROUP_ID,
  EXTERNAL_GROUP_LABEL,
  file_module_resolver,
  file_of_symbol_path,
  module_group_id,
  MODULE_GROUP_PREFIX,
  MODULE_SCAFFOLD_ORIGIN,
  path_module_resolver,
} from "./model/module_scaffold";
export type { ModuleResolver, ModuleScaffold } from "./model/module_scaffold";

// task-27.1.3 — the flow entity, deterministic skeleton, membership, and persistence-row builders
export {
  BRIDGE_EDGE_KIND,
  build_flow_member_edges,
  build_flow_node,
  build_skeleton_flows,
  build_symbol_path_index,
  collect_persisted_flow,
  FLOW_MEMBER_EDGE_KIND,
  FLOW_NODE_KIND,
  flow_id_of,
  flow_of_leaf,
  hydrated_seed_paths,
  induce_members,
  order_flows,
  paths_of,
  reachable_from,
  read_hydrated_flows,
  reconstruct_flow_membership,
  skeleton_to_summary,
  UNATTRIBUTED_FLOW_ID,
  UNATTRIBUTED_FLOW_LABEL,
} from "./model/flow";
export type { BridgeEdge, FlowMembership, PersistedFlowRows, SkeletonFlow } from "./model/flow";

// task-27.1.3 AC#3/#6 — per-flow render projection + per-view budget
export { DEFAULT_FLOW_BUDGET, project_flow, project_hydrated_flow } from "./model/flow_projection";
export type { FlowBudget, ProjectFlowOptions } from "./model/flow_projection";

// task-27.1.2 AC#2/#3 — the single re-extraction funnel (relocations re-anchor inline)
export { re_extract } from "./reextract/re_extract";
export type { DriftFinding, ReExtractDeps, ReExtractOrigin, ReExtractResult } from "./reextract/re_extract";
// task-27.1.6.4 AC#1 — the turn-level symbol change set the funnel emits
export { compute_symbol_delta } from "./reextract/symbol_delta";
export type { RelocatedSymbol, SymbolDelta } from "./reextract/symbol_delta";

// Deterministic orphan-entrypoint detection (the --list-entrypoints inventory substrate)
export { DEFAULT_GAP_OPTIONS, find_orphan_entrypoints } from "./agentic/gap_detection";
export type { GapDetectionOptions } from "./agentic/gap_detection";

// task-27.1.4 AC#2 — agentic bridge builder + registry-shaped detector
export { BRIDGE_CONFIDENCE_INFERRED, bridge_edge_key, build_bridge_edges } from "./agentic/bridge";
export type { BridgeCandidate } from "./agentic/bridge";
export {
  AGENTIC_REGISTRY_EXTRACTOR_ID,
  AGENTIC_REGISTRY_EXTRACTOR_VERSION,
  detect_meta_json_sub_agent_bridges,
} from "./agentic/registry_detector";
export type { MetaJsonRegistryInput } from "./agentic/registry_detector";

// task-27.1.4 AC#3 — deterministic-first description policy + agentic-owned writer
export { DEFAULT_DESCRIBE_CAP, plan_descriptions } from "./agentic/describe_policy";
export type {
  DescribeMember,
  DescriptionPlan,
  DescriptionSource,
  DescribePolicyOptions,
  ExistingDescription,
  PlannedDescription,
} from "./agentic/describe_policy";
export { DESCRIPTION_NODE_KIND, description_node_id, write_descriptions } from "./agentic/write_descriptions";
export type { ResolvedDescription, WriteDescriptionsResult } from "./agentic/write_descriptions";

// task-27.1.4 AC#5 — the agentic-substrate writer
export { DEFAULT_AGENTIC_WRITER_LIMITS, write_agentic_substrate } from "./agentic/agentic_writer";
export type {
  AgenticWriteOptions,
  AgenticWriteReport,
  AgenticWriterLimits,
  SubstrateProposal,
} from "./agentic/agentic_writer";

// task-27.1.4 AC#6 — task-21.2 → task-27.0 literal skill extractor port
export {
  EXTRACTOR_ID_MARKDOWN,
  EXTRACTOR_ID_META_JSON,
  EXTRACTOR_VERSION,
  ingest_skill,
  LITERAL_DOC_EDGE_KIND,
  parse_frontmatter,
  parse_markdown_links,
  read_sub_agents,
  SKILL_DOC_KIND,
  SKILL_TO_REFERENCE_KIND,
  SKILL_TO_SCRIPT_KIND,
  SKILL_TO_SUBAGENT_KIND,
} from "./extractors";
export type { MarkdownLink, SkillIngestDeps, SkillIngestResult, SubAgentDecl } from "./extractors";
