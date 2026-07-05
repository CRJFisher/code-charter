---
id: TASK-27.1.20.3
title: Persist a reconcile run log and sync-status record
status: To Do
assignee: []
created_date: "2026-07-05 13:50"
labels:
  - drift
  - observability
dependencies: []
parent_task_id: TASK-27.1.20
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[Data source for all other tooling] FlowOutcome, DeferredRetirement, hydration-cap notices, and stitch skip reasons are serialized to stderr — which lands in the Claude session transcript, a different process — and then discarded. Nothing in graph.db can answer "why did flow X get retired?", "why was retirement deferred and did it ever complete?", or "which file set drove the last sync?". Silence-by-design makes correctness bugs indistinguishable from healthy no-ops; a durable record is the shared fix for findings in both review goals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Append per turn to a JSONL sidecar (drift_reconcile_log.jsonl beside graph.db) or a disposable reconcile_log table: timestamp, file set, per-flow action + reason, deferred retirements with reasons, placeholder-vs-llm description counts
- [ ] #2 Include a last-attempt / last-success / last-error sync-status record so a silently dropped or failed reconcile is distinguishable from nothing-changed
- [ ] #3 Log a diagnostic when a delta.modified symbol_path fails the anchored_symbols join in body_modified_member_ids (the known two-id-space seam, a silent-staleness hole)

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Files: packages/drift/src/reconcile/types.ts, packages/drift/src/reconcile/reconcile.ts, packages/drift/src/bin/drift_reconcile.ts
<!-- SECTION:NOTES:END -->
