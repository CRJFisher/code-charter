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
 * empty reconcile). The watermark advances (over the full set, including dropped files) only once the
 * turn is durably accounted for — the set staged atomically, or legitimately nothing to stage — so a
 * turn is reconciled once, idle turns no-op, and a failed stage re-fires the same edits next turn
 * instead of skipping them forever. Any failure degrades to a silent no-op (exit 0); a hook must
 * never break the session.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { is_stop_hook_input, type StopHookOutput } from "../hooks/hook_payloads";
import {
  merge_pending_reconcile,
  parse_pending_reconcile,
  pending_reconcile_path,
  write_pending_reconcile_atomic,
  type PendingReconcile,
} from "../hooks/pending_reconcile";
import { decide_stop_action } from "../hooks/stop_decision";
import { derive_transcript_path } from "../hooks/transcript_path";
import {
  parse_watermark,
  select_stale_watermarks,
  serialize_watermark,
  WATERMARK_FILE_PREFIX,
  worked_on_since,
} from "../hooks/stop_watermark";
import { resolve_db_path } from "../hooks/resolve_db_path";
import { filter_flow_relevant } from "../reconcile/flow_relevance";
import { to_repo_relative } from "../reconcile/paths";
import { read_stdin } from "./read_stdin";

/** A cursor untouched for a week belongs to a session that ended long ago; GC drops it. */
const WATERMARK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The watermark lives beside the store (the gitignored `.code-charter/`) and is keyed PER SESSION:
 * concurrent sessions in one repo each have their own cursor. A single shared cursor is keyed to one
 * transcript_path, so every alternation between sessions reads a "different transcript", resets to 0,
 * and re-fires the whole session's edits.
 */
function watermark_path(cwd: string, session_id: string): string {
  const safe = session_id.replace(/[^A-Za-z0-9_-]/g, "_");
  return path.join(path.dirname(resolve_db_path(process.env, cwd)), `${WATERMARK_FILE_PREFIX}.${safe}.json`);
}

/**
 * Prune dead per-session cursors from the store dir so `.code-charter/` does not accrue one file per
 * past session forever. Runs every fire (cheap: a single readdir + stat of a small dir) and is fully
 * best-effort — the hook must never break the session, so any IO failure is swallowed.
 */
function gc_stale_watermarks(dir: string): void {
  try {
    // Stat each entry defensively: one unreadable sibling (a dangling symlink, or a file a concurrent
    // session removed between readdir and stat) must not abort pruning the rest — it drops to null.
    const entries = fs.readdirSync(dir).flatMap((name) => {
      try {
        return [{ name, mtime_ms: fs.statSync(path.join(dir, name)).mtimeMs }];
      } catch {
        return [];
      }
    });
    for (const stale of select_stale_watermarks(entries, Date.now(), WATERMARK_MAX_AGE_MS)) {
      fs.rmSync(path.join(dir, stale), { force: true });
    }
  } catch {
    /* pruning is opportunistic — a missing dir is not the hook's problem */
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
  gc_stale_watermarks(path.dirname(state_path));
  let prev = null;
  try {
    prev = parse_watermark(fs.readFileSync(state_path, "utf8"));
  } catch {
    prev = null; // no prior cursor → treat the whole transcript as this turn's edits (first fire)
  }

  const { worked_on, next } = worked_on_since(transcript_text, payload.transcript_path, prev);

  // The cursor covers the FULL worked-on set (including dropped non-flow files), so a doc/config edit
  // is never re-considered next turn. It is persisted on every path EXCEPT a failed stage: advancing
  // past edits that never landed in the pending file would skip them forever.
  const persist_watermark = (): void => {
    try {
      fs.mkdirSync(path.dirname(state_path), { recursive: true });
      fs.writeFileSync(state_path, serialize_watermark(next));
    } catch {
      /* if the cursor cannot be persisted, the hook still works — it just may re-fire next turn */
    }
  };

  // Only files that can form a flow are worth reconciling; an all-docs/config turn drops to empty and the
  // no-new-drift guard no-ops it instead of launching a reconcile that would find nothing.
  const { relevant, dropped } = filter_flow_relevant(worked_on, payload.cwd);
  if (dropped.length > 0) {
    const names = dropped.map((file_path) => to_repo_relative(file_path, payload.cwd)).join(", ");
    process.stderr.write(`drift: skipping ${dropped.length} non-flow file(s) this turn: ${names}\n`);
  }

  const decision = decide_stop_action(payload, relevant);
  if (!decision.block) {
    // Idle, all-dropped, or loop-guard turn: nothing to stage, so nothing the cursor could lose.
    persist_watermark();
    return;
  }

  // Stage the changed-file set plus the session context (transcript join key + the verbatim
  // instruction) for the sub-agent's script to fetch — the instruction carries no file list.
  // Union with any unconsumed prior set (the script claims and settles it per reconcile
  // outcome), so a declined or failed handoff is retried, not overwritten. Staged paths are
  // repo-relative forward-slash, the reconcile bin's `--files` contract.
  const pending_path = pending_reconcile_path(resolve_db_path(process.env, payload.cwd));
  const current: PendingReconcile = {
    files: relevant.map((file_path) => to_repo_relative(file_path, payload.cwd)),
    session: { session_id: payload.session_id, cwd: payload.cwd, instruction: decision.instruction },
  };
  try {
    let prior: PendingReconcile = { files: [], session: null };
    try {
      prior = parse_pending_reconcile(fs.readFileSync(pending_path, "utf8")) ?? prior;
    } catch {
      /* nothing pending */
    }
    write_pending_reconcile_atomic(pending_path, merge_pending_reconcile(prior, current));
  } catch {
    // Nothing staged → blocking would dispatch an empty reconcile; no-op instead. The cursor is
    // deliberately NOT advanced, so the same edits re-fire next turn instead of being lost.
    return;
  }
  // Tripwire on the derived-transcript-path rule (docs/contracts/reconcile_run_record.md): the
  // payload carries the host's live path, so a host-side slug change surfaces here as a note
  // instead of as silent misjoins in the trajectory view.
  const derived = derive_transcript_path(payload.cwd, payload.session_id);
  if (derived !== payload.transcript_path) {
    process.stderr.write(
      `drift: derived transcript path diverges from the host's (derived ${derived}, host ${payload.transcript_path})\n`,
    );
  }
  persist_watermark();
  const output: StopHookOutput = {
    decision: "block",
    reason: decision.instruction,
    systemMessage: decision.system_message,
  };
  process.stdout.write(JSON.stringify(output));
}

main()
  .catch(() => {
    /* never break the host session */
  })
  .finally(() => process.exit(0));
