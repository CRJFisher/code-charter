---
id: TASK-27.1.6.4
title: "Standalone-doc flows: doc nodes and doc↔code linkage so unconnected .md edits can be reconciled"
status: To Do
created_date: "2026-06-04"
assignee: []
labels:
  - drift
  - flows
  - docs
  - graph-db
parent_task_id: TASK-27.1.6
dependencies:
  - task-27.1.6
  - task-27.1.6.1
references:
  - backlog/tasks/task-27.1.6.1 - Drift-MCP-tool-ergonomics-try-out-and-review.md
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

v1 forms flows two ways: a **skill directory** (`SKILL.md` + its scripts/references/sub-agents) and a **code entrypoint tree** (the Ariadne call graph). A **standalone doc** — a `.md` that is neither inside a skill bundle nor referenced by code — belongs to no flow. The task-27.1.6.1 Stop-hook flow-relevance pre-filter (AC#5/#6) takes the conservative path for these (option a): a standalone-doc edit is ignored and skipped so it never gates a turn with a no-op reconcile. This task is the deferred option (b): give standalone docs a place in a flow so their edits can be reconciled.

The work is doc representation, not the recovery surface: a standalone `.md` becomes a doc node on the agentic lane, and its markdown links / references to code symbols become doc↔code edges, so the doc joins (or seeds) a flow. A standalone-doc edit then maps to a flow and re-syncs through the existing `Stop`-hook → `drift-sync` path, rather than being skipped.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 **Doc node:** a standalone `.md` is representable as a doc node on the agentic lane (additive kind/attributes per task-27.0's reservation discipline — no schema migration)
- [ ] #2 **Doc↔code linkage:** markdown links/references from the doc resolve to code symbols as edges, so the doc joins or seeds a flow
- [ ] #3 **Reconcilable:** a standalone-doc edit maps to a flow and re-syncs through the existing `Stop`-hook → `drift-sync` path, replacing the task-27.1.6.1 log-and-skip for docs that now connect; the flow-relevance pre-filter recognises a connected doc as flow-relevant
- [ ] #4 **No new trigger surface:** linkage rides the existing reconcile chain — no second hook, no review queue (preserves task-27.1.6's no-review-apparatus invariant)
- [ ] #5 **Tests:** a fixture with a standalone `.md` linking to a code symbol forms/joins a flow and survives re-sync

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Add a doc-node representation and a markdown-link → code-symbol extractor.
2. Make flow detection attach standalone docs to the flows their links reach (or seed a doc-rooted flow).
3. Teach the flow-relevance pre-filter (`packages/drift/src/reconcile/flow_relevance.ts`) to recognise a connected doc as flow-relevant, so its edits trigger a reconcile instead of being skipped.
4. Fixture + test for a standalone `.md` linking to a code symbol.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

<!-- Added when work begins. -->

<!-- SECTION:NOTES:END -->
