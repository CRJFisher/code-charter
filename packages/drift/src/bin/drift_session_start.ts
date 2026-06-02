#!/usr/bin/env node
/**
 * The `SessionStart` hook entry. Reads the payload from stdin, lists outstanding working-tree
 * drift, and emits a read-only banner injecting it into context. It NEVER reconciles and never
 * blocks. Any failure degrades to a silent no-op (exit 0).
 */

import { is_session_start_hook_input } from "../hooks/hook_payloads";
import { list_outstanding_drift } from "../hooks/git_drift";
import { build_session_start_output } from "../hooks/session_start_banner";
import { read_stdin } from "./read_stdin";

async function main(): Promise<void> {
  const raw = await read_stdin();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  const cwd = is_session_start_hook_input(payload) ? payload.cwd : process.cwd();
  const output = build_session_start_output(list_outstanding_drift(cwd));
  if (output.hookSpecificOutput !== undefined) {
    process.stdout.write(JSON.stringify(output));
  }
}

main()
  .catch(() => {
    /* never break the host session */
  })
  .finally(() => process.exit(0));
