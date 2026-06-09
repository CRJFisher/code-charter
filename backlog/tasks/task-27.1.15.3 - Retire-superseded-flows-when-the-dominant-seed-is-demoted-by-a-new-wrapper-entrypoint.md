---
id: TASK-27.1.15.3
title: >-
  Retire superseded flows when the dominant seed is demoted by a new wrapper
  entrypoint
status: To Do
assignee: []
created_date: "2026-06-09 21:14"
labels:
  - drift
  - flows
  - graph-db
dependencies: []
references:
  - task-27.1.15
  - packages/drift/src/reconcile/reconcile.ts
  - packages/drift/src/reconcile/affected_flows.ts
parent_task_id: TASK-27.1.15
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Task-27.1.15 replaced the ≥50% Jaccard overlap remap with seed-gone retirement: a persisted code flow is soft-deleted when its stored entry_points no longer resolve (reconcile.ts:147-155 via stored_seed_symbol_ids). That covers renames and removals, but not the third case the remap covered: **demotion**. `build_symbol_path_index` (packages/core/src/model/flow.ts:257-263) indexes ALL call-graph nodes, not just entry points — so when an existing flow's entrypoint is wrapped by a new caller (demoted to a non-entrypoint; the symbol still exists), the old flow's seed still resolves and the flow is never retired, while the wrapper hydrates a superset flow under its own id. The two overlapping live flows then persist and re-sync indefinitely. The deleted remap collapsed exactly this case: jaccard(old ∪ {wrapper}, old) ≥ 0.5 for any non-empty flow.

No data is lost (flow content is agent-regenerated), but the flow list accumulates duplicates and the task-27.1.15 AC#2 claim ("the seed-gone path covers the cases the remap covered") is not fully true. Either close the gap — retirement should fire when a flow's dominant seed is no longer an entry point of the live graph (or its member set is subsumed by another live flow) — or make an explicit recorded decision that coexistence is acceptable.

Files in the path: packages/drift/src/reconcile/affected_flows.ts (surfacing), packages/drift/src/reconcile/reconcile.ts (resync_persisted_flow retirement), packages/core/src/model/flow.ts (symbol-path index).

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 When an existing flow's dominant seed is demoted to a non-entrypoint by a new wrapper caller, reconcile leaves exactly one live flow (the wrapper's superset flow); the superseded flow is retired — or a recorded decision in this task documents why coexistence is acceptable.
- [ ] #2 A reconcile_code.test.ts case covers the wrapped-entrypoint scenario end-to-end (hydrate flow, add wrapper caller, reconcile, assert single live flow).
- [ ] #3 Genuine multi-entrypoint flows that legitimately share members are not retired by the chosen mechanism (negative case covered by test).
- [ ] #4 Full suite green.
<!-- AC:END -->
