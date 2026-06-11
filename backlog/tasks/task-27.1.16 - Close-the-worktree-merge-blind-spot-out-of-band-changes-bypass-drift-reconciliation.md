---
id: TASK-27.1.16
title: >-
  Close the worktree/merge blind spot: out-of-band changes bypass drift
  reconciliation
status: To Do
assignee: []
created_date: "2026-06-11 22:30"
labels:
  - drift
  - hooks
  - sub-agents
dependencies:
  - task-27.1.6.6
references:
  - packages/drift/src/bin/drift_stop_hook.ts
  - packages/drift/src/hooks/transcript_parser.ts
  - packages/drift/src/reconcile/reconcile.ts
  - packages/drift/assets/commands/drift.md
parent_task_id: TASK-27.1
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

**The blind spot.** Drift detection derives the turn's worked-on set by parsing `Edit`/`Write` tool calls out of the session transcript (`worked_on_since` over `EDIT_TOOL_NAMES`). Two real workflows change the main checkout's code without ever appearing as edit tool calls, so their drift is never reconciled:

1. **Worktree development.** A task built in a git worktree (`/tmp/worktree-<task>/…`) produces edit tool calls whose absolute paths lie outside the main checkout. The Stop hook stages them anyway — `to_repo_relative()` yields `../…` paths — and `reconcile()` silently drops anything starting with `".."` (`reconcile.ts`, the `changed` filter). The reconciler reports a clean no-op while the staged set was actually non-empty and meaningful.
2. **Git-applied changes.** The merge that lands the worktree branch into main (equally: pull, rebase, cherry-pick, codegen) mutates tracked files with no transcript footprint at all. After the merge `git status` is clean, so even the manual `/drift` fallback (porcelain-based) finds nothing.

Observed live at the close of task-27.1.6.6: a merge changed 17 flow-relevant source files in `packages/core`/`packages/drift`; three consecutive reconcile runs (two hook-fired, one manual) updated zero flows. The store's flow tier silently lags every worktree-built task — which is now the dominant development style in this repo.

**Direction.** Two layers, smallest-first:

- **Never drop silently.** When staged paths fall outside the repo root, say so: the Stop hook (or `reconcile()`) reports the dropped `../…` paths on stderr instead of no-oping quietly. A blind spot you can see is half fixed.
- **Catch git-applied drift.** The reliable signal for out-of-band change is the repo's HEAD moving without corresponding transcript edits. Candidate mechanism: the Stop hook (or `drift_sync.js`'s list pass) persists the last-reconciled commit (`drift_last_reconciled_head` beside the store); when the current HEAD differs, `git diff --name-only <last>..HEAD` unions into the staged set before reconciling, and the marker advances with the watermark. This covers merge/pull/rebase/cherry-pick uniformly, costs one `git diff` per fire, and needs no worktree-specific logic — the worktree case reduces to it because the merge is the moment the changes reach the checkout the store describes. Map a worktree edit's path into the main checkout instead only if the diff-based approach proves too coarse (it re-stages files the agent never touched, but the engine's symbol-level triggers already no-op untouched symbols cheaply).

Scope bound: detection/staging only — the reconcile engine, the three agentic modes, and the two-phase skill orchestration are unchanged; they already handle any honest file list.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Staged paths outside the repo root are never dropped silently: the run reports each dropped path and the count on stderr (hook or engine, one place, not both).
- [ ] #2 A git-applied change (merge/pull/rebase/cherry-pick) to flow-relevant files is detected and staged on the next reconcile fire without any edit tool call having touched those files; a HEAD-moved marker (or equivalent) prevents re-staging the same range twice.
- [ ] #3 The worktree workflow end-to-end is covered: build on a worktree branch, merge into the main checkout, next reconcile updates/hydrates the affected flows (proven by a test at the hook/script boundary, or a recorded manual run in this task's notes).
- [ ] #4 The manual `/drift` path documents (and supports) reconciling a commit range, so a known out-of-band change can be reconciled on demand.
- [ ] #5 Idle turns stay no-ops: a fire with no transcript edits and an unmoved HEAD stages nothing and does not launch the sub-agent.

<!-- AC:END -->
