---
id: TASK-27.1.15.3
title: >-
  Retire superseded flows when the dominant seed is demoted by a new wrapper
  entrypoint
status: Done
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

- [x] #1 When an existing flow's dominant seed is demoted to a non-entrypoint by a new wrapper caller, reconcile leaves exactly one live flow (the wrapper's superset flow); the superseded flow is retired — or a recorded decision in this task documents why coexistence is acceptable.
- [x] #2 A reconcile_code.test.ts case covers the wrapped-entrypoint scenario end-to-end (hydrate flow, add wrapper caller, reconcile, assert single live flow).
- [x] #3 Genuine multi-entrypoint flows that legitimately share members are not retired by the chosen mechanism (negative case covered by test).
- [x] #4 Full suite green.
<!-- AC:END -->

## Implementation Notes

## High-level summary

A persisted flow superseded by a wrapper is retired the moment the wrapper's flow is written. After each flow hydrated or re-synced in a turn, `retire_flows_subsumed_by` (reconcile.ts) checks the persisted flows: a candidate is retired when none of its stored seeds is still an entry point of the live graph (each demoted to a non-entrypoint — typically by the new wrapper caller) AND its induced member set is subsumed by the just-written flow's, both judged against the live graph. The conjunction is the chosen mechanism (demoted seed + subsumption): coexisting genuine entrypoint flows that merely share members are safe by construction, because each still owns a live entrypoint.

The check is on-demand by construction — it runs only off this turn's writes, against the persisted list already in memory, never as a sweep over untouched flows. Stray superseded flows whose code is untouched linger until their code next changes, which is the accepted trade-off of the on-demand model. The turn's record stays truthful: a same-turn resync of the now-superseded flow is replaced by the retire record (one final record per flow), and a flow retired by an earlier iteration's check is skipped by the 3b loop rather than re-synced — re-syncing it would upsert the flow node live again and undo the retirement.

### How the acceptance criteria were addressed

- **#1** — `reconcile_code.test.ts` "retires a superseded flow when a new wrapper demotes its entrypoint": one reconcile turn after the wrapper appears, exactly one live flow remains (the wrapper's), the old flow is soft-deleted, and the retire outcome is in the result.
- **#2** — the wrapped-entrypoint scenario runs end-to-end through the real Ariadne headless path (hydrate, add wrapper, reconcile, assert single live flow), plus a same-turn resync-then-retire case and a 3b ordering case (a persisted wrapper that sorts before its victim retires it without resurrection).
- **#3** — the negative case pins that subsumption alone never retires: two genuine entrypoints sharing members both stay live across a re-sync of the shared member.

