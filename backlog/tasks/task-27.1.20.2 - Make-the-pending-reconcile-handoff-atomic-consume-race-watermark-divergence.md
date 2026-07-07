---
id: TASK-27.1.20.2
title: >-
  Make the pending-reconcile handoff atomic (consume race + watermark
  divergence)
status: Done
assignee: []
created_date: "2026-07-05 13:50"
labels:
  - drift
  - concurrency
  - data-loss
  - critical
dependencies: []
parent_task_id: TASK-27.1.20
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[CRITICAL data loss] Two independently-reported windows share one root. (a) CONSUME RACE: drift_sync.js unlinks drift_pending_reconcile.json only after a successful reconcile; a Stop fire that stages new edits during a long-running reconcile has its union deleted by that unlink and never reconciled until re-edited. (b) WATERMARK DIVERGENCE: drift_stop_hook.ts advances the transcript cursor on every fire regardless of whether the sub-agent launches or succeeds; if the pending file is lost the edits are permanently skipped, with no cursor to recover them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 The reconciler renames the pending file to a private working name (atomic on same filesystem) BEFORE starting; deletes on success, unions back on failure
- [x] #2 The pending file is written via temp-file + atomic rename in both drift_stop_hook.ts and drift_sync.js
- [x] #3 The transcript watermark advances only after the staged set is durably written
- [x] #4 A cross-check test writes via serialize_pending_reconcile (TS) and consumes via drift_sync.js (the duplicated JS parser) to guard against format divergence

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

The Stop-hook → reconciler handoff carries the changed-file set through `drift_pending_reconcile.json` beside the store, and its two writers are unsynchronized: the Stop hook can stage a new set at any moment, including while a reconcile is running. Consuming that file by deleting it after the reconcile destroyed any set staged mid-run, and advancing the transcript watermark before staging meant a failed stage skipped those edits permanently — together, silent data loss.

The handoff is now a claim/settle protocol whose exclusion primitive is an atomic same-directory rename. Before the reconcile starts, `drift_sync.js` renames the staged set to a pid-stamped private claim (`drift_pending_reconcile.claim.<pid>.json`); the settle then only ever touches the claim, never the live pending path, so a mid-reconcile Stop fire lands in a fresh pending file that structurally cannot be consumed by this run. On success the claim is deleted; on failure its set is unioned back into whatever is staged now (read-merge-rename, first-seen order); a claim whose pid is dead — a crashed run — is folded back into the pending file on the next launch. Both writers land the pending file via temp-file + atomic rename, and the Stop hook persists the watermark only once the turn is durably accounted for: staged atomically, or legitimately nothing to stage. Dry runs read without claiming.

The protocol is documented in `pending_reconcile.ts`'s module doc (the format's home; also the shared atomic staging writer); the claim lifecycle is implemented only in `drift_sync.js` (dependency-free, so the byte format is duplicated there and pinned bidirectionally by cross-check tests in `drift_sync_contract.test.ts`); the watermark gating lives in `drift_stop_hook.ts`'s main flow.

Accepted residual windows (deliberate, documented in the code): the microsecond read-merge-rename lost-update between unsynchronized writers, a claim pid recycled by an unrelated live process, and power-loss durability (no fsync) — all degrade to a delayed reconcile or a bounded re-fire, never to the silent-loss class this task closes.

## Implementation details

- `packages/drift/src/hooks/pending_reconcile.ts` — module doc is the canonical protocol description; adds `write_pending_reconcile_atomic` (same-directory temp + rename, throws so the caller can withhold the watermark).
- `packages/drift/src/bin/drift_stop_hook.ts` — watermark persistence moved into a per-outcome `persist_watermark` call: idle/all-dropped/loop-guard turns and successful stages advance; a failed stage returns without advancing so the same edits re-fire next turn (AC#3).
- `packages/drift/assets/skills/drift-sync/scripts/drift_sync.js` — claim lifecycle: `recover_orphaned_claims` (dead-pid, own-pid, and pid-0 claims folded back; each orphan settles independently), `claim_pending` (atomic rename out of the live path), per-outcome settle (delete on success, union-back + restage diagnostic on failure). `spawn_bin` reports failure instead of exiting so a claim is always settled (AC#1). JS-side `write_pending_atomic` mirrors the TS writer (AC#2).
- `packages/drift/src/skill/drift_sync_contract.test.ts` — mid-reconcile staging race, failure union-back with concurrent re-stage, orphan/pid-0 recovery, live-peer non-theft, settle-failure → claim-survives → next-launch recovery, dry-run non-claiming, malformed-claim discard, and the bidirectional TS↔JS format cross-checks (AC#4).
- Acceptance criteria map to tests: AC#1 → the claim/settle contract tests; AC#2 → the atomic-writer unit tests plus tmp-residue assertions on both success and failure paths; AC#3 → "holds the watermark when staging fails" plus the pre-existing no-op-path tests; AC#4 → the two cross-check tests.
- Reviewed by a 10-lens fan-out; verified findings fixed (own-pid/pid-0 claim recovery, per-orphan fault isolation, recovery/restage stderr diagnostics, README artifact note). Known-and-accepted: non-ENOENT rename errors in `claim_pending` read as "nothing staged" (the set stays pending and retries later); a failed claim-delete after a successful union-back can re-union the same set once (dedup makes it a no-op).

Files: packages/drift/src/hooks/pending_reconcile.ts, packages/drift/src/bin/drift_stop_hook.ts, packages/drift/src/hooks/stop_watermark.ts, packages/drift/assets/skills/drift-sync/scripts/drift_sync.js
<!-- SECTION:NOTES:END -->
