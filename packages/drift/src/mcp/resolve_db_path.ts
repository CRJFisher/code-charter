/**
 * Resolve the on-disk graph store path the MCP server opens. The host launches the server with
 * the workspace as cwd; `.code-charter/graph.db` matches the VSCode extension's convention. The
 * `CODE_CHARTER_DB` env var overrides it (the installer sets this in the MCP server config).
 */

import * as path from "node:path";

export const DRIFT_DB_ENV_VAR = "CODE_CHARTER_DB";
export const DEFAULT_DB_RELATIVE_PATH = path.join(".code-charter", "graph.db");

export function resolve_db_path(env: NodeJS.ProcessEnv, cwd: string): string {
  const override = env[DRIFT_DB_ENV_VAR];
  if (override !== undefined && override.length > 0) {
    return path.isAbsolute(override) ? override : path.join(cwd, override);
  }
  return path.join(cwd, DEFAULT_DB_RELATIVE_PATH);
}
