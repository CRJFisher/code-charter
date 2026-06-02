#!/usr/bin/env node
/**
 * The `Stop` hook entry. Reads the payload from stdin, parses the transcript for the files
 * worked on this turn, and — unless a loop guard or the no-new-drift check fires — blocks the
 * stop and feeds the main agent the instruction to launch `drift-reconciler`. Any failure
 * degrades to a silent no-op (exit 0); a hook must never break the host session.
 */

import * as fs from "node:fs";

import { is_stop_hook_input, type StopHookOutput } from "../hooks/hook_payloads";
import { decide_stop_action } from "../hooks/stop_decision";
import { parse_worked_on_files } from "../hooks/transcript_parser";
import { read_stdin } from "./read_stdin";

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

  const decision = decide_stop_action(payload, parse_worked_on_files(transcript_text));
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
