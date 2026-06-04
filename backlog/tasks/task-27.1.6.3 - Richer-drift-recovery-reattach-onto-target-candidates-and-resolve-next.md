---
id: TASK-27.1.6.3
title: "Richer drift recovery: reattach-onto-new-target, candidate suggestions, kind disambiguator, resolve-next"
status: To Do
created_date: "2026-06-04"
assignee: []
labels:
  - drift
  - mcp
  - ux
  - resolver
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

The `drift.*` recovery surface recovers two kinds of stranding well: a **relocation** (a rename with an unchanged body) is staged and committed onto the renamed symbol via `drift.resolve {reanchor}`, and a **miss** (the anchor resolves nowhere) is binned and restored onto its original anchor via `drift.resolve {reattach}`. The gap is the case between them: a description whose symbol is genuinely gone, where the user knows the *right new* symbol but the tool cannot get them there. `reattach` only un-deletes onto the now-absent original anchor; it never re-points stranded content onto a different symbol, and `drift.list` offers no candidate targets to choose from. The task-27.1.6.1 ergonomics review (AC#3) keeps the surface and defers this richer recovery here.

This task extends the same two MCP tools and the same recovery loop — it is one coherent unit of work on the surface:

- **Reattach-onto-new-target:** `drift.resolve` can bind stranded content to a chosen new symbol (an anchor that resolves today), not only un-delete onto the old one.
- **Candidate suggestions:** `drift.list` entries carry ranked candidate targets (same file, anchor/semantic similarity) so a chooser can pick a target without separately hunting for it.
- **`kind` disambiguator:** `drift.resolve` addresses a node vs an edge explicitly, removing the reliance on the unenforced node-id/edge-key disjointness the current `id`-only lookup rests on.
- **Resolve-next:** a loop affordance to walk the outstanding bin entries one at a time.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 **Reattach-onto-new-target:** `drift.resolve` accepts a target symbol and binds the stranded content's anchor to it, carrying the user-authored fields across; the bare single-argument `reattach` (restore onto the original anchor) still works
- [ ] #2 **Candidate suggestions:** `drift.list` entries carry a ranked `candidates[]` of plausible new targets (e.g. same file, anchor/semantic similarity) so a chooser can pick a target from the listing alone
- [ ] #3 **`kind` disambiguator:** `drift.resolve` addresses a node vs an edge unambiguously rather than recovering the kind by an `id`-only `find` over a disjointness assumption
- [ ] #4 **Resolve-next affordance:** a loop primitive to walk outstanding bin entries one at a time
- [ ] #5 **Invariants hold:** the surface stays user-facing-only (no reconcile-via-MCP creep — reconciliation remains the `Stop`-hook → sub-agent → `drift-sync` path) and additive to task-27.0's reservations (no new table, no schema migration)
- [ ] #6 **Tests:** colocated tests cover reattach-onto-target, candidate ranking, and `kind`-disambiguated addressing

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Extend `drift_resolve` (`packages/drift/src/mcp/drift_tool.ts`) with an optional target symbol and a `kind` disambiguator; re-anchor the stranded node onto the chosen target via the resolver/`reanchor_node` path, carrying user-owned fields across.
2. Extend the bin query (`packages/drift/src/mcp/re_attachment_bin.ts`) to compute ranked candidate targets per entry from the current resolver index.
3. Add a resolve-next affordance (e.g. `drift.resolve` returning the next outstanding entry, or a `drift.next`).
4. Update the MCP tool schemas/descriptions (`build_drift_server.ts`) and the dogfooding walkthrough.
5. Colocated tests for each new capability.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

<!-- Added when work begins. -->

<!-- SECTION:NOTES:END -->
