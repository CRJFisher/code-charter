---
id: TASK-27.1.6.1
title: "Drift MCP tool ergonomics: try-out and review (drift.list / drift.resolve)"
status: To Do
assignee: []
created_date: "2026-06-02"
labels:
  - mcp
  - ux
  - drift
  - review
parent_task_id: TASK-27.1.6
dependencies:
  - task-27.1.1
  - task-27.1.6
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
  - backlog/tasks/task-27.1.1 - Drift-infrastructure-substrate-MCP-agent-harness-hook-installer.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The user-facing code→diagram resolution path is the `drift.*` MCP surface shipped by task-27.1.1: `drift.list(scope?)` reads the re-attachment bin (user-authored and agentic content stranded from the code it described) and `drift.resolve(id, resolution)` reattaches or deletes a bin entry. These tools are built and unit-tested against the store contract, but their **ergonomics are unproven** — nobody has driven them in a real session to recover a genuinely stranded description after a rename/split. The shape may not be the right surface: the `drift_list`/`drift_resolve` naming, the bare-`id` addressing (a node id vs an edge key, resting on an unenforced disjointness assumption), the `reattach`/`delete` vocabulary, how a user or agent discovers outstanding drift and loops through it, and how much each tool returns to make a confident choice are all guesses until exercised.

This task waits until the first release lands. task-27.1.6 (the v1 ship point) is where the `Stop`-hook auto-sync actually produces re-attachment-bin entries in real use, so only then is there a genuine stranding to resolve. It sequences **after task-27.1.6 and before task-27.1.7** and gates nothing on the critical path — it is a deliberate "come back and review the surface once it is real" task. Scope is try-out + review + a keep/revise/replace decision; any revision small enough lands here, anything larger spins a concrete follow-up.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Drive `drift.list` and `drift.resolve` end-to-end in a real Claude Code session against a **genuine re-attachment-bin entry** — one produced by a rename/split that strands a user-authored description (the task-27.1.2 milestone scenario) — discovering it via `drift.list`, reattaching it to the new symbol via `drift.resolve`, and confirming the authored content carries across
- [ ] #2 Evaluate the ergonomics across: tool **naming** (`drift_list`/`drift_resolve` vs the `drift.*` concept); the **`id`-only addressing** (node id vs edge key, and whether the disjointness assumption needs a `kind` disambiguator); the **`reattach`/`delete`** resolution vocabulary; **discoverability** (the `SessionStart` banner → `drift.list` → `drift.resolve` loop a user/agent actually follows); and the **richness of the returned payload** — is `drift.list`'s output enough to choose a target with confidence, and is `drift.resolve`'s result/no-op feedback clear?
- [ ] #3 Decide and document: **keep / revise / replace**. If revising, name the concrete change (e.g. a richer `drift.list` payload with the stranded content + candidate targets, a `kind` disambiguator on resolve, a "resolve-next" affordance, clearer naming) and either apply it here if small or spec it as a follow-up
- [ ] #4 Confirm the invariants still hold after any change: the `drift.*` surface stays **user-facing only** (no reconcile-via-MCP creep — reconciliation remains the `Stop`-hook → sub-agent → `drift-sync` path), and the surface stays **additive to task-27.0's reservations** (no new table, no schema migration)

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Reproduce a real stranding: run the task-27.1.2 rename milestone so the auto-sync leaves a user-authored description in the re-attachment bin.
2. Walk the recovery loop as a user would — `SessionStart` banner → `drift.list` → pick → `drift.resolve(reattach)` — and as an agent would (the tools called programmatically), noting every point of friction.
3. Score the ergonomics dimensions in AC#2; capture concrete pain points, not taste.
4. Decide keep/revise/replace (AC#3); apply a small revision in place or open a follow-up for a larger one.
5. Re-confirm the user-facing-only and additive-to-27.0 invariants (AC#4).

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
