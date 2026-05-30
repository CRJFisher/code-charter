---
id: TASK-27
title: Diagram-Driven Development — implementation strategy
status: To Do
assignee: []
created_date: "2026-05-28"
labels:
  - architecture
  - ariadne
  - graph-db
  - mcp
  - hooks
  - skills
  - sub-agents
  - ui
  - consistency
dependencies: []
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
---

## Description

The diagram is a peer artifact that sits above the code: the code captures _how_, the diagram captures _what_ and _why_. You manage teams of AI coding agents landing changes faster than you can read every diff, and the diagram is the surface for working at that level — comprehending a moving codebase at a glance, and directing change as intent.

This task is the implementation master-plan. `doc-5` states the observable capabilities (the _what_); this task and its children state the mechanisms (the _how_).

The work is **one shared model plus two directions**:

- **task-27.0 — the custom graph model.** The single shared foundation: a custom graph layered over the Ariadne-derived graph that draws individual code symbols into a bigger, connected, higher-level picture of the repo, and that survives code change. Both directions operate on this model; nothing else is genuinely shared.
- **task-27.1 — code → diagram.** Build the comprehension map from the model, and keep it in sync as code changes: detect which higher-level nodes an edit affects (the diff signal), triage, re-render. Read-only for authoring.
- **task-27.2 — diagram → code.** Author change by describing it, turn it into a reviewable code change, and apply it. Owns authority/pin, which exists only where diagram-authoring and code-editing can conflict.

`task-21.1` is the persistence engine all three are realized on. Every surface ships through a shared `.claude/` tree (skills + hooks) with the MCP server as the universal fallback — Claude Code first, then Cursor, surfaces degrading gracefully where a host lacks a hook.

## Acceptance Criteria

- [ ] #1 The genuinely shared mechanism is isolated in task-27.0; task-27.1 and task-27.2 add only their direction-specific work on top, with no shared mechanism duplicated between them
- [ ] #2 Every capability in `doc-5` maps to exactly one home in task-27.0, task-27.1, or task-27.2
- [ ] #3 task-27.2 can be added after task-27.1 ships without a schema migration, a render-signature change, or a refactor of task-27.1 code — because task-27.0 reserves the open shapes

## Implementation Plan

The detail lives in the three children. This parent only fixes the decomposition:

- **What is shared** is the custom graph model (task-27.0): the derived layer (disposable, rebuilt from code), the custom layer (preserved, append-only — the higher-level nodes, descriptions, groupings, and adjudications that make the graph connected and comprehensible), the anchoring that ties custom content to code elements so it survives edits, and the open shapes that keep the two directions additive.
- **What is not shared** is each direction's own work: building and syncing the map (task-27.1), and authoring-then-applying code change including authority/pin (task-27.2). task-27.1's diff-signal + triage is reused by task-27.2's round-trip, but it is built in task-27.1, not in the shared model.

## Implementation Notes

<!-- Added when work begins. -->
