---
id: TASK-27.1.15.2
title: >-
  Refresh and commit the installed dogfood drift surface; retire bin vocabulary
  residue
status: Done
assignee: []
created_date: "2026-06-09 21:14"
labels:
  - drift
  - docs
  - dogfood
dependencies: []
references:
  - task-27.1.15
  - packages/drift/assets/commands/drift.md
  - packages/drift/assets/skills/drift-sync/SKILL.md
parent_task_id: TASK-27.1.15
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The task-27.1.15 strip's doc-alignment commit (4df4926) rewrote the source assets under packages/drift/assets, but the repo's own git-tracked installed copies — the dogfood surface agents in this repo actually load — are still the pre-strip versions:

- `.claude/commands/drift.md` (step 3, lines 19-21) directs an agent to "read the re-attachment bin with the `drift.list` MCP tool" — `drift.list` and the bin no longer exist; the live server registers only `drift_resolve` with the `reanchor` arm.
- `.claude/skills/drift-sync/SKILL.md` still advertises "user-authored content is recalled and re-applied", the watermark-ladder carry of user fields, and the "recoverable re-attachment bin, never auto-pruned". A corrected copy exists only as an uncommitted working-tree change.

An agent following the committed instructions calls nonexistent tools and over-promises preservation that no longer exists. Refresh the installed copies from the assets (re-run the installer or copy directly) and commit them.

Small residue to clean in the same pass:

- `packages/core/src/model/round_trip.test.ts:31` header comment still references "the re-attachment bin".
- `packages/drift/src/reconcile/ariadne_adapter.test.ts:74` test title says "not binned"; the assertion is still meaningful but the vocabulary is retired — "not soft-deleted" is current.
- The registered worktree `.claude/worktrees/task-27.1.6.1` (branch worktree-task-27.1.6.1) holds the entire pre-strip tree as live-looking source and dominates greps for removed symbols.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 The committed .claude/commands/drift.md and .claude/skills/drift-sync/ contents match the packages/drift/assets sources; grep over .claude/ finds no reference to drift.list, drift.next, the re-attachment bin, or user-edit recall-and-reapply.
- [x] #2 round_trip.test.ts:31 and the ariadne_adapter.test.ts:74 test title use current vocabulary (soft-delete; no bin).
- [x] #3 The stale worktree .claude/worktrees/task-27.1.6.1 is removed and unregistered (git worktree remove + branch cleanup), or its retention is documented.
- [x] #4 Test suites green after the rename/comment edits.
<!-- AC:END -->

## Implementation Notes

## High-level summary

The committed dogfood surface and the assets are byte-identical, and no retired vocabulary remains on any agent-facing surface: `grep` over `.claude/commands`, `.claude/agents`, and `.claude/skills` finds no `drift.list`, `drift.next`, re-attachment-bin, recall-and-reapply, or reanchor references. The installed copies were refreshed from the assets in the same commits that edited them (tasks 27.1.15.1 and 27.1.15.4), so the surface a session loads always matches the shipped package.

The vocabulary residue is retired: `round_trip.test.ts`'s repair-policy comment states the current model (a relocation re-anchors inline; a miss soft-deletes, with agentic content regenerated on a later sync), and the `ariadne_adapter.test.ts` title and local speak soft-delete vocabulary. The stale pre-strip worktree `.claude/worktrees/task-27.1.6.1` (branch fully merged into main) is removed and unregistered, so greps no longer surface removed symbols from it.

Suite health (AC#4): the drift package's `test` script runs each Ariadne-heavy reconcile suite (`reconcile_code`, `reconcile_delta`, `reconcile_membership`, `ariadne_adapter`) in its own jest process — Ariadne `Project` state accumulates per worker process, and once several `HeadlessProject`-heavy suites share one worker, indexing returns empty results mid-run. A fresh process per heavy suite is exactly what running a suite in isolation does; the root cause lives upstream in `@ariadnejs/core` and is out of this repo's scope. With the split, the full suite is deterministically green.

