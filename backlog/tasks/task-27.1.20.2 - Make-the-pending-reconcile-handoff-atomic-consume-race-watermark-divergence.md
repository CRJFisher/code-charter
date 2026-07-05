---
id: TASK-27.1.20.2
title: >-
  Make the pending-reconcile handoff atomic (consume race + watermark
  divergence)
status: To Do
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

- [ ] #1 The reconciler renames the pending file to a private working name (atomic on same filesystem) BEFORE starting; deletes on success, unions back on failure
- [ ] #2 The pending file is written via temp-file + atomic rename in both drift_stop_hook.ts and drift_sync.js
- [ ] #3 The transcript watermark advances only after the staged set is durably written
- [ ] #4 A cross-check test writes via serialize_pending_reconcile (TS) and consumes via drift_sync.js (the duplicated JS parser) to guard against format divergence

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Files: packages/drift/src/hooks/pending_reconcile.ts, packages/drift/src/bin/drift_stop_hook.ts, packages/drift/src/hooks/stop_watermark.ts, packages/drift/assets/skills/drift-sync/scripts/drift_sync.js
<!-- SECTION:NOTES:END -->
