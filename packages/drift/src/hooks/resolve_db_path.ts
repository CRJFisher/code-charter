/**
 * Resolve the on-disk graph store path. The Stop hook bin runs with the target repo as cwd;
 * `.code-charter/graph.db` matches the VSCode extension's convention. The `CODE_CHARTER_DB` env
 * var is an operator override, and the `drift-sync` skill resolves the same var-or-default path,
 * so the hook's watermark/pending files and the reconcile bin provably sit beside one store.
 */

import * as path from "node:path";

const DRIFT_DB_ENV_VAR = "CODE_CHARTER_DB";
const DEFAULT_DB_RELATIVE_PATH = path.join(".code-charter", "graph.db");

export function resolve_db_path(env: NodeJS.ProcessEnv, cwd: string): string {
  const override = env[DRIFT_DB_ENV_VAR];
  if (override !== undefined && override.length > 0) {
    return path.isAbsolute(override) ? override : path.join(cwd, override);
  }
  return path.join(cwd, DEFAULT_DB_RELATIVE_PATH);
}
