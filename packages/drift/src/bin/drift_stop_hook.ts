#!/usr/bin/env node
/**
 * The `Stop` hook entry. Reads the payload from stdin, determines the files worked on *this turn* (the
 * edits since the previous Stop fire, via the transcript watermark), pre-filters them to the ones that
 * can form a flow, and — unless a loop guard or the no-new-drift check fires — stages the set in the
 * pending-reconcile file, blocks the stop, and feeds the main agent the instruction to launch
 * `drift-reconciler` (the file list travels via the pending file, never the instruction). A turn no-ops
 * four ways: the loop guard, no edits this turn, every edited file is non-flow (docs/config the
 * reconcile engine would drop anyway — filtering them here avoids launching a full-repo reconcile that
 * does nothing), or the pending set cannot be staged (blocking with nothing staged would dispatch an
 * empty reconcile). The watermark is advanced and persisted each fire (over the full set, including
 * dropped files) so a turn is reconciled once and idle turns no-op. Any failure degrades to a silent
 * no-op (exit 0); a hook must never break the session.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { is_stop_hook_input, type StopHookOutput } from "../hooks/hook_payloads";
import {
  merge_pending_reconcile,
  parse_pending_reconcile,
  pending_reconcile_path,
  serialize_pending_reconcile,
} from "../hooks/pending_reconcile";
import { decide_stop_action } from "../hooks/stop_decision";
import { parse_watermark, serialize_watermark, worked_on_since } from "../hooks/stop_watermark";
import { resolve_db_path } from "../installer/resolve_db_path";
import { filter_flow_relevant } from "../reconcile/flow_relevance";
import { to_repo_relative } from "../reconcile/paths";
import { read_stdin } from "./read_stdin";

/**
 * The watermark lives beside the store (the gitignored `.code-charter/`) and is keyed PER SESSION:
 * concurrent sessions in one repo each have their own cursor. A single shared cursor is keyed to one
 * transcript_path, so every alternation between sessions reads a "different transcript", resets to 0,
 * and re-fires the whole session's edits.
 */
const WATERMARK_PREFIX = "drift_stop_watermark";

function watermark_path(cwd: string, session_id: string): string {
  const safe = session_id.replace(/[^A-Za-z0-9_-]/g, "_");
  return path.join(path.dirname(resolve_db_path(process.env, cwd)), `${WATERMARK_PREFIX}.${safe}.json`);
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

  const state_path = watermark_path(payload.cwd, payload.session_id);
  let prev = null;
  try {
    prev = parse_watermark(fs.readFileSync(state_path, "utf8"));
  } catch {
    prev = null; // no prior cursor → treat the whole transcript as this turn's edits (first fire)
  }

  const { worked_on, next } = worked_on_since(transcript_text, payload.transcript_path, prev);

  // Advance the cursor every fire so the next turn starts fresh — even on a no-op or a loop-guard skip.
  // The cursor covers the FULL worked-on set (including dropped non-flow files), so a doc/config edit is
  // never re-considered next turn.
  try {
    fs.mkdirSync(path.dirname(state_path), { recursive: true });
    fs.writeFileSync(state_path, serialize_watermark(next));
  } catch {
    /* if the cursor cannot be persisted, the hook still works — it just may re-fire next turn */
  }

  // Only files that can form a flow are worth reconciling; an all-docs/config turn drops to empty and the
  // no-new-drift guard no-ops it instead of launching a reconcile that would find nothing.
  const { relevant, dropped } = filter_flow_relevant(worked_on, payload.cwd);
  if (dropped.length > 0) {
    const names = dropped.map((file_path) => to_repo_relative(file_path, payload.cwd)).join(", ");
    process.stderr.write(`drift: skipping ${dropped.length} non-flow file(s) this turn: ${names}\n`);
  }

  const decision = decide_stop_action(payload, relevant);
  if (decision.block) {
    // Stage the changed-file set for the sub-agent's script to fetch — the instruction carries no
    // file list. Union with any unconsumed prior set (the script deletes the file only after a
    // successful reconcile), so a declined or failed handoff is retried, not overwritten. Staged
    // paths are repo-relative forward-slash, the reconcile bin's `--files` contract.
    const pending_path = pending_reconcile_path(resolve_db_path(process.env, payload.cwd));
    const staged = relevant.map((file_path) => to_repo_relative(file_path, payload.cwd));
    try {
      let prior: string[] = [];
      try {
        prior = parse_pending_reconcile(fs.readFileSync(pending_path, "utf8")) ?? [];
      } catch {
        /* nothing pending */
      }
      fs.mkdirSync(path.dirname(pending_path), { recursive: true });
      fs.writeFileSync(pending_path, serialize_pending_reconcile(merge_pending_reconcile(prior, staged)));
    } catch {
      return; // nothing staged → blocking would dispatch an empty reconcile; no-op instead
    }
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
