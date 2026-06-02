#!/usr/bin/env node
/**
 * The `drift` MCP server entry. Opens the graph store (degrading to a no-op NullGraphStore on a
 * host without the SQLite engine), builds the server with file-backed call logging, and serves
 * over stdio. The store path comes from `CODE_CHARTER_DB` or the `.code-charter/graph.db`
 * default; the call log sits beside it.
 */

import * as path from "node:path";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { open_graph_store } from "@code-charter/core";

import { make_append_logger } from "../mcp/call_log";
import { build_drift_server } from "../mcp/build_drift_server";
import { resolve_db_path } from "../mcp/resolve_db_path";

async function main(): Promise<void> {
  const db_path = resolve_db_path(process.env, process.cwd());
  const store = open_graph_store(db_path);
  const log = make_append_logger(path.join(path.dirname(db_path), "drift-mcp.log"));
  const server = build_drift_server(store, log);
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  process.stderr.write(`drift-mcp: fatal: ${String(error)}\n`);
  process.exit(1);
});
