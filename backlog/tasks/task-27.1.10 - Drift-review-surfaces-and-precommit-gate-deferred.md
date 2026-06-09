---
id: TASK-27.1.10
title: "Drift review surfaces + PreCommit gate + change summary (deferred, post-v1)"
status: To Do
assignee: []
created_date: "2026-06-01"
labels:
  - hooks
  - ui
  - consistency
  - deferred
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.1.6
  - task-27.1.9
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

> **Deferred — NOT in v1.** v1 (task-27.1.6) keeps diagrams honest by silent auto-sync, with no review inbox, no blocking gate, and — after task-27.1.15 — no drift recovery surface at all (the re-attachment bin, the drift MCP tools, and the SessionStart banner are stripped). This task adds the **review/surfacing layer** for when the user wants to _see_ code↔diagram drift rather than have it silently absorbed: the hook→surface map (built fresh, not extending a v1 surface), an observation/lifecycle store if needed, the single PreCommit gate, and a change-scoped comprehension summary.

It is deferred because the leaner v1 deliberately omits the review apparatus (the data layer is strictly the auto-sync). It builds on the triage classifier (task-27.1.9) for the structural-vs-cosmetic decision the gate fires on.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Hook→surface map: this task **re-introduces** read surfaces task-27.1.15 stripped — a `SessionStart` read-only drift banner and a `/drift` walkthrough — since v1 (post-strip) has no review/recovery surface; graceful degradation where a host lacks a primitive. The v1 auto-sync trigger is the **Stop hook only** (task-27.1.6); these review surfaces are additive read/walkthrough surfaces, not new auto-sync triggers
- [ ] #2 A single **PreCommit git-hook gate** — a hook **distinct from v1's Stop-hook auto-sync trigger** — firing only for structural/intent drift (per task-27.1.9's classifier) touching staged files; never cosmetic; `--no-verify` bypass; fire/no-fire matrix test — the one deliberate interruption (added only if/when review is wanted; v1 has none)
- [ ] #3 If a lifecycle/observation store is needed for the inbox, it is declared additively (CREATE TABLE … IF NOT EXISTS in `CREATE_SCHEMA_SQL` + a `TABLE_REGISTRY_SEED` entry, `disposable:false`) — no `ALTER`
- [ ] #4 A change-scoped comprehension summary groups a change-set's drift into one behaviour-level narrative

<!-- AC:END -->

## Implementation Notes

<!-- Added when work begins. -->
