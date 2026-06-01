---
id: TASK-27.1.6
title: "Per-flow drift engine: detection scoped to flow membership, tables, re-attachment bin"
status: To Do
assignee: []
created_date: "2026-06-01"
labels:
  - consistency
  - graph-db
  - flows
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.1.1
  - task-27.1.3
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Keeps a flow's diagram honest as code changes — the code→diagram drift signal, **scoped to flow membership** rather than repo-wide. A flow's members (its call-graphs + docs) are the natural proximity boundary, which replaces the global hop-distance scoping with something simpler and sharper. Drift reconciliation runs through the **background sub-agent** model (task-27.1.5): a hook detects drift and the diagram self-heals out-of-band without interrupting the session.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A batch **resolve-all-anchors** pass writes the `anchor_resolution` cache (task-27.0.3's first reader); recomputed on rebuild, never authoritative
- [ ] #2 **Two-phase verify-then-update** diff keyed by `(source_file, source_range, extractor)` against the old graph, then write the update; invalidation triggers = file edits, symbol renames, doc deletions, heading-anchor changes; separate literal (eager, file-hash) vs LLM (lazy, span/target) caches
- [ ] #3 **Drift is scoped to flow membership:** the affected flow(s) are identified by membership; drift is surfaced per-flow, and leaf→flow up-propagation walks `agentic.contains` to flag the enclosing flow as affected
- [ ] #4 New **preserved** `drift_observations` + `drift_adjudications` tables self-register in `table_registry` (no `ALTER`); observations run `open → triaged → resolved | dismissed | auto-archived(180d)`; terminal-state rows excluded at query time without deletion
- [ ] #5 Accept/reject **adjudications** stored as user-layer rows keyed `(anchor, origin, edge_key)`; the agentic pass (task-27.1.4) queries them before re-emitting an inferred edge so a decision survives every rebuild and is never re-proposed
- [ ] #6 **Re-attachment bin, extended to flow granularity:** a resolver `miss` — or a flow split/merge that strands a user-given name/pin — surfaces recoverably (reattach via `drift.resolve`, or delete); never auto-pruned

<!-- AC:END -->

## Open decisions

<!-- SECTION:DECISIONS:BEGIN -->

- **D-DRIFT-HOP-DISTANCE — keep hop-distance proximity at all, given flow membership already scopes drift?** Options: drop it (flow membership IS the scope) · keep as optional within-flow ranking for large flows · keep repo-wide only if un-flowed code must still surface drift. _Stake:_ surplus code vs large-flow ergonomics; forces the question of whether code in no flow gets v1 drift coverage.

<!-- SECTION:DECISIONS:END -->

## Implementation Notes

<!-- Added when work begins. -->
