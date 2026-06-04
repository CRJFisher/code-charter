---
id: TASK-27.1.6.5
title: "Concise Stop-hook instruction: drop the inline file list, let the drift-reconciler pull the divergences from a script"
status: To Do
created_date: "2026-06-04"
assignee: []
labels:
  - drift
  - hooks
  - ux
  - sub-agents
parent_task_id: TASK-27.1.6
dependencies:
  - task-27.1.6
  - task-27.1.6.1
references:
  - backlog/tasks/task-27.1.6.1 - Drift-MCP-tool-ergonomics-try-out-and-review.md
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The `Stop`-hook reconcile instruction (`build_reconcile_instruction` in `packages/drift/src/hooks/stop_decision.ts`) blocks the turn and emits one bullet line **per worked-on file** (`worked_on.map((f) => \`- ${f}\`).join("\n")`). On a substantial turn this balloons into a wall of paths the main agent must read and copy verbatim into the `drift-reconciler` launch — verbose, easy to mistruncate, and (when several checkouts touch the same files) duplicative. The file set is also threaded **through the prompt prose**, making the instruction the transport for structured data it is poorly suited to carry.

This task makes the `Stop` block **concise** and moves the file set off the prompt and onto a **source the reconciler reads directly**:

- **Concise instruction:** the `Stop` output states, at most, *how many* files need reconciliation and the single directive — *launch the `drift-reconciler` sub-agent*. It no longer enumerates the files inline.
- **Reconciler-driven divergence source:** the exact worked-on set (the divergences) is exposed where the `drift-reconciler`'s `drift-sync` skill can read it via a script, in the most convenient structured form, rather than being parsed back out of the instruction text. The set is already computed deterministically this turn via the transcript watermark (`worked_on_since`); this task persists/exposes it for the script instead of inlining it.

The result: the hook says *"N file(s) drifted — run `drift-reconciler`"*, and the reconciler's script answers *"here are exactly which N, in reconcile-ready form."*

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 **Concise instruction:** `build_reconcile_instruction` no longer embeds a per-file bullet list; the `Stop` block states at most the count of files needing reconciliation and the directive to launch the `drift-reconciler` sub-agent (with the standing rule: do not reconcile inline)
- [ ] #2 **Divergence source for the reconciler:** the exact worked-on file set is exposed where the `drift-reconciler` / `drift-sync` skill reads it via a script, not parsed from the instruction prose — driven by the same this-turn transcript watermark that scopes the decision today
- [ ] #3 **Convenient form:** the script reports the divergences in the form most convenient for the reconciler to act on (e.g. the worked-on set, already de-duplicated and/or partitioned into flow-relevant paths), so the sub-agent feeds `drift-sync` without re-deriving anything
- [ ] #4 **Invariants hold:** the hook stays decision/read-only (no reconcile-via-hook); the per-turn watermark scoping is preserved; the `stop_hook_active` loop guard and the "no new drift → no-op" check are unchanged; reconciliation remains the `Stop`-hook → sub-agent → `drift-sync` path
- [ ] #5 **Accurate count + handoff:** the `systemMessage` count stays correct, and the `drift-reconciler` agent prompt / `drift-sync` skill docs are updated so the sub-agent knows to pull its file set from the script rather than from the launching prompt
- [ ] #6 **Tests:** colocated tests cover the concise instruction (no file list, count present) and the script/source that yields the worked-on divergences

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. **Slim the instruction** (`stop_decision.ts`): drop the `worked_on.map(...).join` bullet list from `build_reconcile_instruction`; keep the count and the single launch directive. Keep `build_system_message` accurate.
2. **Persist the worked-on set** for the reconciler: have the `Stop` hook bin write this turn's worked-on file set (the watermark-scoped `worked_on`) to a state the `drift-sync` script reads — a sidecar beside the store/skill, mirroring how the installer drops the `.drift_reconcile_bin` sidecar — or expose a script that recomputes it from the transcript watermark on demand.
3. **Reconciler reads the source:** update the `drift-sync` skill (and the `drift-reconciler` agent prompt) so the sub-agent obtains its file set from the script/source, partitioned into flow-relevant paths, instead of from the launching prompt.
4. **Tests + docs:** update `stop_decision` tests for the concise instruction; add colocated tests for the divergence-source script; refresh the dogfooding walkthrough / agent prompt.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

<!-- Added when work begins. -->

<!-- SECTION:NOTES:END -->
