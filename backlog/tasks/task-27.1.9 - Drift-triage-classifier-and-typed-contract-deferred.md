---
id: TASK-27.1.9
title: "Drift triage classifier + typed TriageSubject/TriageVerdict contract (deferred, post-v1)"
status: To Do
assignee: []
created_date: "2026-06-01"
labels:
  - sub-agents
  - consistency
  - deferred
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.1.1
  - task-27.1.6
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

> **Deferred — NOT in v1.** v1 code→diagram is pure auto-sync (task-27.1.6): the diagram always re-syncs and preserves user edits, with no classification of _whether_ or _how_ to act. This task adds the **review/escalation apparatus** on top, for when drift should be triaged rather than silently absorbed — and it owns the **typed generic triage contract** that the diagram→code direction (task-27.2) reuses.

A registered custom sub-agent (launched by the main agent, returning ~nothing) that classifies a drift's blast radius (cosmetic vs intent/structural) without auto-editing source, plus the typed `TriageSubject` `{anchor, before_state, proposed_after_state, rationale?}` / `TriageVerdict` `{classification, blast_radius, staleness, rationale}` exported from `@code-charter/types` — the contract task-27.2's actionability assessment calls unchanged. It is deferred because v1 does not surface drift for review; it becomes relevant once the diagram→code authoring direction or a richer review inbox lands.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A cosmetic/intent/structural classifier expressed as a decision table over the resolver verdict + edge-diff; deterministic arms named (no LLM), only the fuzzy arm invokes the sub-agent; never auto-edits source
- [ ] #2 Typed `TriageSubject` / `TriageVerdict` exported from `@code-charter/types`; the `diagram.propose → TriageSubject` mapping documented so task-27.2 reuses the identical interface
- [ ] #3 Runs as a registered custom sub-agent launched by the main agent (the same execution path as the sync sub-agent); does not rot the main session's context

<!-- AC:END -->

## Implementation Notes

<!-- Added when work begins. -->
