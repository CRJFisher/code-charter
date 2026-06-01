---
id: TASK-27.1.8
title: "Drift delivery surfaces, PreCommit git gate, and change comprehension summary"
status: To Do
assignee: []
created_date: "2026-05-31"
labels:
  - hooks
  - ui
  - mcp
  - consistency
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.1.6
  - task-27.1.7
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The product-level surfacing that turns the drift signal into the comprehension experience doc-5 promises: the live hook surfaces, the single deliberate blocking interruption (the PreCommit gate), and — the headline of the whole direction — a **change-scoped comprehension summary** that lets the developer read a large agent-made change as intent rather than as a long row list.

doc-5's hardest open question is "when to surface drift without it feeling like paperwork." This task answers it: batched, work-scoped, non-blocking everywhere except one PreCommit gate that fires only for still-open structural/intent drift touching the commit.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 **Hook → surface mapping** via task-27.1.1's installer: `SessionStart` → punch-list banner; `UserPromptSubmit` → one-line scoped nudge when the prompt mentions a file with relevant drift; `/drift` → user-invoked side-by-side walkthrough; `PostToolUse`/`Stop` → fire the consistency engine (task-27.1.6). Nothing here blocks mid-edit
- [ ] #2 **Single PreCommit git-hook gate:** a git pre-commit hook shells to a `code-charter drift gate --staged` CLI; it fires **only** for drift the task-27.1.7 classifier marks structural/intent, in state `open | triaged`, touching files in `git diff --cached`; never for cosmetic drift and never for already-resolved/dismissed drift; `git commit --no-verify` bypasses. (This is a git hook, distinct from the in-session Claude Code hook events)
- [ ] #3 A **fire/no-fire matrix test** covers each drift class (cosmetic, structural/intent, resolved, dismissed) × each state (open, triaged, resolved, dismissed); plus an assertion that the non-blocking observation path (parent AC#5) does not block the session, and that a gate that fires and is acknowledged does not re-fire on the same item
- [ ] #4 **Graceful degradation:** where `SessionStart` is absent (e.g. Cursor) the banner degrades to `/drift` or an MCP pull (`drift.list`); the read surface persists without the live push
- [ ] #5 **Change-scoped comprehension summary:** a change-set's drift rows are grouped into one behaviour-level narrative (what changed at the architecture/behaviour altitude), with the per-anchor rows as the drill-down — sharing the task-27.1.7 triage orchestrator's merged output. A before/after **map diff** is explicitly out of scope (the section G before-position seam serves task-27.2)

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. **Live surfaces:** wire `SessionStart`/`UserPromptSubmit`/`PostToolUse`/`Stop` through task-27.1.1's installer to the banner, nudge, and consistency-engine triggers; build the `/drift` walkthrough.
2. **PreCommit gate:** the `code-charter drift gate --staged` CLI predicate consuming the task-27.1.7 classification + task-27.1.6 state, scoped to `git diff --cached`; `--no-verify` bypass.
3. **Comprehension summary:** group a change-set's drift rows (via the triage orchestrator's merged output) into a behaviour-level narrative; per-anchor rows as drill-down.
4. **Degradation:** banner → `/drift`/`drift.list` fallback where a host lacks `SessionStart`.
5. Tests: the fire/no-fire matrix; non-blocking assertion; no-re-fire-after-ack; degradation path; summary groups a multi-row change correctly.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
