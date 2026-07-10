---
id: TASK-27.1.20.15
title: Record the agent-trajectory join key in the reconcile run record
status: Done
assignee: []
created_date: "2026-07-09"
labels:
  - drift
  - observability
dependencies: []
parent_task_id: TASK-27.1.20
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The reconcile run log (.3) persists the *effect* of each sync — per-flow outcomes with reasons, describe tallies, sync status — but not the *trajectory* that produced it. The Stop hook receives `payload.session_id` (drift_stop_hook.ts) and discards it, so the instruction the reconciler was given and the context it gathered are unjoinable to the outcome they produced. The session transcript is directly derivable from the join key (`~/.claude/projects/<slugified-cwd>/<session_id>.jsonl`) — no discovery machinery needed — but only if the key is persisted. General rule this task installs: an agentic mechanism's run record carries the join key to its transcript, or its verify loop has nothing to read. All trajectory tooling (.16, .17) depends on this one field.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 session_id and cwd ride the pending-reconcile handoff (written by the Stop hook, consumed by the reconcile bin), and each drift_reconcile_log.jsonl record persists session_id, the derived transcript path, and the verbatim reconciler instruction the hook issued
- [x] #2 Hand-invoked and no-session runs record session_id: null (and omit the transcript path) without erroring; --dry-run behaviour is unchanged (writes neither sidecar)
- [x] #3 The run-record format is specified in a versioned, pinned contract doc in packages/drift (per decision-10): mechanism-agnostic keys (run_id, session_id, transcript path, instruction, timestamps) at top level, drift-specific payload (flow outcomes, describe tallies) under a nested detail key — existing .3 fields migrate into that split in the same change

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

Every reconcile run record now carries the join key to the session that launched it. The Stop hook stages its session context — `session_id`, `cwd`, and the verbatim instruction it emits as the block reason — inside the pending-reconcile handoff (`{version, files, session}`); `drift_sync.js` claims the handoff and forwards the context to the reconcile bin as `--session-id`/`--session-cwd`/`--instruction` on the from-pending path only; the bin writes a split-shape record to `drift_reconcile_log.jsonl` with the mechanism-agnostic envelope at top level (`schema_version`, time-sortable `run_id`, `session_id`, derived `transcript_path`, `instruction`, `timestamp`) and every drift field under `detail`. Hand-invoked runs record `session_id: null` with `transcript_path` omitted; `--dry-run` still writes nothing.

Both on-disk formats are pinned contract docs in `packages/drift/docs/contracts/` (`pending_reconcile_handoff.md`, `reconcile_run_record.md`), per decision-10. The transcript path is computed once at write time by `src/hooks/transcript_path.ts` — `<$CLAUDE_CONFIG_DIR|~/.claude>/projects/<slug(cwd)>/<session_id>.jsonl`, slug rule `[^A-Za-z0-9] → "-"` pinned against observed host slugs — and the raw `cwd` is not persisted (the slug is lossy; `session_id` is the record-level authoritative identifier). The Stop hook tripwires this derivation against the payload's live `transcript_path` on every fire and notes divergence on stderr, so a host-side slug change surfaces in the field instead of as silent misjoins.

Session context in the handoff is newest-contributor-wins across the whole union lifecycle (hook re-stage, mid-reconcile union-back, orphan-claim recovery) — files union first-seen, the freshest session labels the run; multi-session attribution is documented as accepted imprecision. The run-log reader (`read_latest_reconcile_record`) accepts only lines carrying the current `schema_version` AND a `detail` object, so pre-contract flat lines and torn lines are skipped, never migrated (the log is disposable). Readers of the moved fields (`inspect/summary.ts`) dot through `detail`; `index.ts` exports the new types plus `derive_transcript_path` for the .16 trajectory reader.

Review (7 lenses) verified all three ACs and drove five fixes: tripwire match/mismatch tests, JS session-precedence primary-branch and orphan-session tests, the contract-partition assertion pinned on the bin's real output, contract-doc corrections (the `transcript_path` presence invariant is "both session_id and cwd known"; derivation prose states the stored-snapshot semantics), and the reader's `detail` guard. Noted, not actioned: the leading-`--` value-flag guard vs the verbatim-instruction promise (unreachable while the instruction is a fixed literal), `run_id` carrying invocation-start time vs `timestamp` completion time (safe under the single-run mutex), and JSON key order differing from the doc tables (not contractual).
<!-- SECTION:NOTES:END -->
