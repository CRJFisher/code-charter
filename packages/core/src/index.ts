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
  build_resolver_index,
  derive_code_state,
  format_anchor,
  parse_anchor,
  resolve_anchor,
  resolver_symbols_from_ariadne,
} from "./resolver";
export type { AriadneFileInput, ResolverIndex, ResolverSymbol } from "./resolver";

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
  build_bridge_edges,
  build_flow_member_edges,
  build_flow_node,
  build_skeleton_flows,
  FLOW_MEMBER_EDGE_KIND,
  FLOW_NODE_KIND,
  flow_id_of,
  flow_of_leaf,
  induce_members,
  order_flows,
  reachable_from,
  read_hydrated_flows,
  skeleton_to_summary,
  UNATTRIBUTED_FLOW_ID,
  UNATTRIBUTED_FLOW_LABEL,
} from "./model/flow";
export type { BridgeEdge, FlowMembership, SkeletonFlow } from "./model/flow";

// task-27.1.3 AC#3/#6 — per-flow render projection + per-view budget
export { DEFAULT_FLOW_BUDGET, project_flow } from "./model/flow_projection";
export type { FlowBudget, ProjectFlowOptions } from "./model/flow_projection";

// task-27.1.2 AC#2/#3/#4 — the single re-extraction funnel, outstanding-drift surface, and re-anchor write
export { re_extract } from "./reextract/re_extract";
export type { DriftFinding, ReExtractDeps, ReExtractOrigin, ReExtractResult } from "./reextract/re_extract";
export { reanchor_node } from "./reextract/reanchor";
export {
  DRIFT_FROM_KEY,
  DRIFT_STAGING_KEYS,
  DRIFT_STATUS_KEY,
  DRIFT_STATUS_RELOCATED,
  DRIFT_TO_CONTENT_HASH_KEY,
  DRIFT_TO_SYMBOL_PATH_KEY,
  outstanding_drift,
} from "./reextract/drift_observation";
export type { DriftObservation } from "./reextract/drift_observation";
