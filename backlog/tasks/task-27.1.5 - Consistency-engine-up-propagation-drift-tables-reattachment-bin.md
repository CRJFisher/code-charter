---
id: TASK-27.1.5
title: "Consistency engine: up-propagation, drift tables, re-attachment bin, proximity"
status: To Do
assignee: []
created_date: "2026-05-31"
labels:
  - consistency
  - graph-db
  - ariadne
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

Generalizes task-27.1.2's leaf diff into the full code→diagram honesty machinery: the two-phase consistency loop, the propagation of a leaf change up to the higher-level (cluster/architecture) nodes the user actually reads, the persisted drift/adjudication state, the proximity scoping that keeps the inbox tolerable, and the re-attachment bin for broken anchors.

This is the diff signal at scale: when code changes, identify which custom-layer nodes the edit affected by re-resolving anchors and walking the persisted containment, surface it without blocking the developer, and persist the irreplaceable adjudications so a dismissed item never re-surfaces — even across an agentic rebuild.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A batch **resolve-all-anchors** pass writes the `anchor_resolution` disposable cache (task-27.0.3's first reader/writer), recomputed on rebuild and never treated as authoritative
- [ ] #2 **Two-phase verify-then-update:** on change, compute edge incidence on the changed files, re-run extractors only on those files, diff new-vs-stored edge sets keyed by `(source_file, source_range, extractor)` against the **old** graph, surface obligations, then write the update in a second phase
- [ ] #3 **Separate literal vs LLM caches:** literal edges recompute eagerly keyed by file content hash; LLM-inferred edges invalidate only when the specific prose span (`referenced_span_hash`) or target symbol changes
- [ ] #4 **Leaf→cluster up-propagation:** after the leaf-edge diff identifies drifted leaves, walk the persisted `agentic.contains` edges (task-27.1.3) upward to the enclosing cluster nodes at each tier and add them to the drift surface as "structurally affected" — so the map stays honest at the altitude the user reads
- [ ] #5 New **preserved** `drift_observations` and `drift_adjudications` tables self-register in `table_registry` (no `ALTER`); observations run `open → triaged → resolved | dismissed | auto-archived(180d)`; a terminal-state row is excluded from the surfaced inbox at query time without deleting the observation
- [ ] #6 Accept/reject **adjudications** are stored as user-layer rows keyed `(anchor, origin, edge_key)`; the agentic gap-fill (task-27.1.6) queries them before emitting an inferred edge — a `rejected` match suppresses re-emission, an `accepted` match re-emits as a user-layer edge — so a decision survives every future `rebuild_layer('agentic')` and is never re-proposed
- [ ] #7 Drift items are scored by **graph hop-distance** from the session working set (min BFS over working-set leaves; for a cluster node, min over member leaves); items below threshold are not surfaced
- [ ] #8 A **re-attachment bin** surfaces a resolver `miss` recoverably: the user reattaches (via `drift.resolve` re-anchor) or deletes; it is never auto-pruned (the preservation guarantee itself is task-27.0)

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. **Resolve-all-anchors** driver writing `anchor_resolution`; the disposable cache is cleared on rebuild.
2. **Two-phase loop** keyed on `(source_file, source_range, extractor)` via `edges_for_files` (read prior state) then `re_extract` (task-27.1.2) for the write phase; invalidation triggers = file edits, symbol renames, doc deletions, heading-anchor changes. v1 invalidation deletes/marks-stale every raw edge whose `source_file` is in the changed set; reverse-incidence is deferred.
3. **Cache split:** literal eager (file hash) vs LLM lazy (`referenced_span_hash`/target symbol).
4. **Up-propagation** walk over `agentic.contains`.
5. **Tables:** `drift_observations(id, anchor, origin, edge_key, state, proximity_score, created_at, archived_at)` and `drift_adjudications(id, anchor, origin, edge_key, decision, created_at)`, both preserved + self-registering; query-time suppression join for terminal states.
6. **Proximity** = hop-distance BFS from the working set (PostToolUse/FileChanged-populated, fallback `file_hashes.last_seen_at`).
7. **Re-attachment bin** surfacing resolver misses.
8. Tests: two-phase diff correctness; up-propagation flags the right clusters; dismissed item not re-surfaced across a rebuild; adjudication suppresses/re-emits inferred edge; proximity threshold; miss → bin.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
