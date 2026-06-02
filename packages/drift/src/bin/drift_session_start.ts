#!/usr/bin/env node
/**
 * The `SessionStart` hook entry. Reads the payload from stdin, reads the outstanding drift the prior
 * session's reconcile staged in the store, and emits a read-only banner injecting it into context. It
 * NEVER reconciles and never blocks. Any failure (including a degraded host with no store) is a silent
 * no-op (exit 0).
 */

import { open_graph_store, outstanding_drift, type DriftObservation } from "@code-charter/core";

import { is_session_start_hook_input } from "../hooks/hook_payloads";
import { build_session_start_output } from "../hooks/session_start_banner";
import { resolve_db_path } from "../mcp/resolve_db_path";
import { read_stdin } from "./read_stdin";

/**
 * Read outstanding drift from the store for `cwd`, degrading to an empty list on any failure —
 * including a fresh repo whose `.code-charter` store does not exist yet (opening it throws). The
 * banner is best-effort context, never a reason to disturb the session.
 */
function read_outstanding_drift(cwd: string): DriftObservation[] {
  let store;
  try {
    store = open_graph_store(resolve_db_path(process.env, cwd));
  } catch {
    return [];
  }
  try {
    return outstanding_drift(store);
  } catch {
    return [];
  } finally {
    store.close();
  }
}

async function main(): Promise<void> {
  const raw = await read_stdin();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  const cwd = is_session_start_hook_input(payload) ? payload.cwd : process.cwd();
  const output = build_session_start_output(read_outstanding_drift(cwd));
  if (output.hookSpecificOutput !== undefined) {
    process.stdout.write(JSON.stringify(output));
  }
}

main()
  .catch(() => {
    /* never break the host session */
  })
  .finally(() => process.exit(0));
