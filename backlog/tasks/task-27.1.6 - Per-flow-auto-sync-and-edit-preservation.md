---
id: TASK-27.1.6
title: "Per-flow auto-sync: keep each flow's diagram in step with the code, preserving your edits"
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

Keeps each flow's diagram in step with the code as it changes — and it is the v1 ship point. The model is **pure auto-sync, not a review queue**: when a flow's code/docs change, the diagram **always re-syncs** (it never asks permission), and any **user-authored content** (description, name, pin) on the affected nodes/edges is **recalled and re-applied** so your intent is carried across the update. A genuine miss — content whose anchor no longer resolves, or a flow split/merge that strands a user-given name — goes to the **re-attachment bin**, recoverable and never auto-pruned.

This is the whole of doc-5's "anything you author is always considered" and "the diagram absorbs drift out-of-band, off your attention and your context." There is **no review apparatus in v1**: no observation/adjudication tables, no `open→triaged→resolved` lifecycle, no cosmetic/intent classifier, no PreCommit gate, no drift inbox. Those are deferred (task-27.1.9 / task-27.1.10) — v1's data layer is strictly the auto-sync + the preservation guarantees the model (task-27.0) already provides. Reconciliation runs through the background sub-agent (task-27.1.1 / task-27.1.5): the user is never interrupted.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 On a flow's code/docs change, the affected flow(s) re-sync **automatically** (re-extract changed files via the single `re_extract(file_set, origin)` entry point, re-derive the affected flow's induced subgraph, re-render) — always update, never gate on the user
- [ ] #2 **Membership resolution:** the flow(s) affected by a changed leaf are computed by re-inducing each flow's subgraph from its stored seeds/bridges/docs (task-27.1.3) — not by an `agentic.contains` tree-walk; a leaf shared by several flows re-syncs all of them
- [ ] #3 **User edits are preserved and re-applied:** user-authored fields (description, name, pin) on affected nodes/edges are recalled and carried across the re-sync via the resolver (task-27.0.3) + the watermark ladder (a `user`-owned field is never overwritten; the row's `layer` is `user` per the task-27.1.2 preservation fix); content following a renamed/moved symbol re-anchors automatically
- [ ] #4 **Re-attachment bin:** when the resolver returns a `miss`, or a flow split/merge strands a user-given name/pin, the affected user content is held in a recoverable re-attachment bin (the user reattaches via `drift.resolve` or deletes); it is never auto-pruned. The bin is a query over preserved-but-unresolved content (task-27.0 soft-delete + resolver miss) — **no new table**
- [ ] #5 The re-sync is driven by the host change hook firing the background reconciliation sub-agent (task-27.1.1), which writes the store directly under `rebuild_layer('agentic')` and returns nothing to the main session — no review queue, no blocking, no context rot
- [ ] #6 No `drift_observations` / `drift_adjudications` tables, no triage classifier, no lifecycle states, no PreCommit gate are introduced — these are explicitly deferred to task-27.1.9 / task-27.1.10

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. **Change detection → affected flows:** on a file-change hook, map changed files to affected flows by re-inducing each flow's subgraph from its persisted seeds/bridges/docs (intersect changed `source_file`s with member incidence).
2. **Re-sync:** call `re_extract(file_set, origin='code-change')` (task-27.1.2) for the changed files; re-derive the affected flow(s); re-render.
3. **Preserve edits:** for each affected node/edge, resolve its anchor (task-27.0.3) and carry user-owned fields across via the watermark ladder; re-anchor content that followed a rename/move.
4. **Re-attachment bin:** surface resolver misses + split/merge-stranded names as a query over preserved-unresolved content; `drift.resolve` reattaches or deletes.
5. Drive it via the background reconciliation sub-agent (task-27.1.1), returns nothing.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
