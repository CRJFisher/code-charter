---
id: TASK-27.1.20.9
title: Harden reconcile against partial/degraded writes
status: To Do
assignee: []
created_date: "2026-07-05 13:51"
labels:
  - drift
  - correctness
dependencies:
  - TASK-27.1.20.1
parent_task_id: TASK-27.1.20
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[MEDIUM soft-integrity gaps] (a) reconcile() issues many independent store mutations with no turn-spanning transaction, so a mid-turn crash leaves half a turn applied. (b) The skill path lacks the code path deferred-retirement guards — a mid-edit truncated SKILL.md (or transiently missing sub-agent file) is unconditionally re-ingested and wholesale-overwrites the skill flow with a shrunken/degraded snapshot, no deferral, no signal. (c) Placeholder descriptions are written expecting the apply-descriptions pass to overwrite them, but nothing guarantees that pass runs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 reconcile() wraps a turn in a single transaction (built on WAL from .1) so a mid-turn crash does not leave half a turn applied
- [ ] #2 The skill path gains deferred-retirement / degraded-snapshot guards mirroring the code path; a truncated or partial SKILL.md bundle defers instead of overwriting
- [ ] #3 Placeholder descriptions are guaranteed to be overwritten by the apply-descriptions pass, or their persistence is guarded/flagged if that pass does not run

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Files: packages/drift/src/reconcile/reconcile.ts, packages/drift/src/reconcile/skill_dir.ts, packages/drift/src/reconcile/describe.ts
<!-- SECTION:NOTES:END -->
