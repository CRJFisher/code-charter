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
 *
 * `read_only` opens a connection that never competes for the write lock and never runs schema
 * init — the extension's read path. It requires an existing db file (opening a missing file
 * throws), so callers guard with an existence check first.
 */
export function open_graph_store(db_path: string, opts?: { read_only?: boolean }): GraphStore {
  if (!is_node_sqlite_supported(current_node_version())) {
    return new NullGraphStore();
  }
  const module = require_module("./storage/sqlite_graph_store") as typeof import("./storage/sqlite_graph_store");
  return new module.SqliteGraphStore(db_path, opts);
}

export { NullGraphStore } from "./storage/null_graph_store";
export type { EdgeRow, GraphStore, GraphTarget, NodeRow, ProvenanceRow, Tier } from "@code-charter/types";

export {
  anchored_symbols_from_ariadne,
  build_resolver_index,
  build_symbol_path,
  derive_code_state,
  format_anchor,
  resolver_symbols_from_ariadne,
} from "./resolver";
export type { AnchoredSymbol, AriadneFileInput, ResolverIndex, ResolverSymbol } from "./resolver";

export { file_of_symbol_path } from "./model/module_scaffold";

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
  hydrated_seed_paths,
  induce_members,
  order_flows,
  paths_of,
  reachable_from,
  read_hydrated_flows,
  reconstruct_flow_membership,
  skeleton_to_summary,
} from "./model/flow";

export { project_flow, project_hydrated_flow } from "./model/flow_projection";

export { re_extract } from "./reextract/re_extract";
export type { SymbolDelta } from "./reextract/symbol_delta";

export { DEFAULT_GAP_OPTIONS, find_orphan_entrypoints } from "./agentic/gap_detection";

export { BRIDGE_CONFIDENCE_INFERRED, build_bridge_edges } from "./agentic/bridge";
export type { BridgeCandidate } from "./agentic/bridge";
export { detect_meta_json_sub_agent_bridges } from "./agentic/registry_detector";

export { plan_descriptions } from "./agentic/describe_policy";
export type { DescriptionSource } from "./agentic/describe_policy";
export { DESCRIPTION_NODE_KIND, description_node_id, write_descriptions } from "./agentic/write_descriptions";
export type { ResolvedDescription } from "./agentic/write_descriptions";

export { write_agentic_substrate } from "./agentic/agentic_writer";
export type { SubstrateProposal } from "./agentic/agentic_writer";

export { ingest_skill, LITERAL_DOC_EDGE_KIND, read_sub_agents } from "./extractors";
export type { SkillIngestResult } from "./extractors";
