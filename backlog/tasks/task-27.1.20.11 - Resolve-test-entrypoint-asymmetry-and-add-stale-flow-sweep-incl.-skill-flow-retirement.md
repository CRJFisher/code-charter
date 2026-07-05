---
id: TASK-27.1.20.11
title: >-
  Resolve test-entrypoint asymmetry and add stale-flow sweep incl. skill-flow
  retirement
status: To Do
assignee: []
created_date: "2026-07-05 13:52"
labels:
  - drift
  - correctness
dependencies:
  - TASK-27.1.20.10
parent_task_id: TASK-27.1.20
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[MEDIUM] build_skeleton_flows hydrates test-file entrypoints as singleton flows, but build_entrypoint_inventory and find_orphan_entrypoints both skip is_test — so test-rooted flows are persisted yet invisible to the agent: un-stitchable and un-retirable clutter. Separately, skill flows appear to have NO retirement path at all — deleting a SKILL.md leaves the flow live.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Test-entrypoint handling is consistent: either test-rooted flows are made visible to the inventory/orphan passes, or they are not hydrated — no persisted-but-invisible clutter
- [ ] #2 A stale-flow sweep retires flows whose seeds no longer exist, including a retirement path for skill flows when a SKILL.md is deleted

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Files: packages/drift/src/reconcile/reconcile.ts, packages/core/src/model/flow.ts, packages/drift/src/reconcile/affected_flows.ts. Behavior locked by .10 first.
<!-- SECTION:NOTES:END -->
