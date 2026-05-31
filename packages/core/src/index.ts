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

export { CustomGraphModel } from "./model/custom_graph_model";
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
