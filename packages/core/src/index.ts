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

export { NullGraphStore } from "./storage/null_graph_store";
export { current_node_version, is_node_sqlite_supported, MIN_NODE_SQLITE_VERSION } from "./storage/node_sqlite_support";
export { CURRENT_SCHEMA_VERSION } from "./storage/schema";
export type { GraphStore } from "@code-charter/types";

// task-27.0.3 — the reusable anchor resolver
export {
  build_resolver_index,
  build_symbol_path,
  compute_content_hash,
  compute_span_hash,
  derive_code_state,
  format_anchor,
  parse_anchor,
  parse_scope_range,
  resolve_anchor,
  resolver_symbols_from_ariadne,
  slice_source,
} from "./resolver";
export type { AriadneFileInput, ResolverIndex, ResolverSymbol } from "./resolver";
