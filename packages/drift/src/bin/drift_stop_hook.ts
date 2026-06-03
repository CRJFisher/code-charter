#!/usr/bin/env node
/**
 * The `Stop` hook entry. Reads the payload from stdin, determines the files worked on *this turn* (the
 * edits since the previous Stop fire, via the transcript watermark), and — unless a loop guard or the
 * no-new-drift check fires — blocks the stop and feeds the main agent the instruction to launch
 * `drift-reconciler`. The watermark is advanced and persisted each fire so a turn is reconciled once and
 * idle turns no-op. Any failure degrades to a silent no-op (exit 0); a hook must never break the session.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { is_stop_hook_input, type StopHookOutput } from "../hooks/hook_payloads";
import { decide_stop_action } from "../hooks/stop_decision";
import { parse_watermark, serialize_watermark, worked_on_since } from "../hooks/stop_watermark";
import { resolve_db_path } from "../mcp/resolve_db_path";
import { read_stdin } from "./read_stdin";

/** The watermark lives beside the store, so it is per-repo and shares the gitignored `.code-charter/`. */
const WATERMARK_FILE = "drift_stop_watermark.json";

function watermark_path(cwd: string): string {
  return path.join(path.dirname(resolve_db_path(process.env, cwd)), WATERMARK_FILE);
}

async function main(): Promise<void> {
  const raw = await read_stdin();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  if (!is_stop_hook_input(payload)) {
    return;
  }

  let transcript_text = "";
  try {
    transcript_text = fs.readFileSync(payload.transcript_path, "utf8");
  } catch {
    transcript_text = "";
  }

  const state_path = watermark_path(payload.cwd);
  let prev = null;
  try {
    prev = parse_watermark(fs.readFileSync(state_path, "utf8"));
  } catch {
    prev = null; // no prior cursor → treat the whole transcript as this turn's edits (first fire)
  }

  const { worked_on, next } = worked_on_since(transcript_text, payload.transcript_path, prev);

  // Advance the cursor every fire so the next turn starts fresh — even on a no-op or a loop-guard skip.
  try {
    fs.mkdirSync(path.dirname(state_path), { recursive: true });
    fs.writeFileSync(state_path, serialize_watermark(next));
  } catch {
    /* if the cursor cannot be persisted, the hook still works — it just may re-fire next turn */
  }

  const decision = decide_stop_action(payload, worked_on);
  if (decision.block) {
    const output: StopHookOutput = {
      decision: "block",
      reason: decision.instruction,
      systemMessage: decision.system_message,
    };
    process.stdout.write(JSON.stringify(output));
  }
}

main()
  .catch(() => {
    /* never break the host session */
  })
  .finally(() => process.exit(0));
