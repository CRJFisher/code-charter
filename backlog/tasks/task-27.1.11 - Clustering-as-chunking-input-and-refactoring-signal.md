---
id: TASK-27.1.11
title: "Semantic clustering as a flow-chunking input and a task-27.2 refactoring signal (deferred)"
status: To Do
assignee: []
created_date: "2026-06-01"
labels:
  - clustering
  - graph-db
  - graphology
  - deferred
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.1.9
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

> **Deferred follow-up — off the v1 critical path.** This is the former "entangled clustering core" (recursive budget cut + cluster-node identity + remap), demoted three times: it is no longer the comprehension organizer, no longer the whole-repo fold, and now merely an **input signal** to chunking a complex flow, plus a **refactoring signal for task-27.2**.

Two real jobs, neither on the v1 critical path:

1. **Flow-chunking input (skill C):** when a single detected flow (task-27.1.5) is too large to read legibly, semantic clustering of the flow's members gives the key-control-flow agent (task-27.1.9) extra signal for how to "chunk up" the flow into sub-groups — behind two cheaper deterministic inputs already available: the file/dir scaffold and call-graph topology.
2. **Refactoring signal (task-27.2):** clusters that cut across the given directory structure reveal where the code's organization has drifted from its behaviour — a diagram→code "this should be reorganized" candidate.

The deterministic cluster-node-identity slice (anchor-set hash + ≥50% overlap remap) has already been **extracted** and re-homed as flow identity in task-27.1.3; only the non-deterministic clustering algorithm remains here.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

> High-level; build only if real flows prove the deterministic chunking inputs insufficient (YAGNI — see D-CLUSTERING-TRIGGER).

- [ ] #1 Host-neutral clustering logic (the `findOptimalClusters` flat-cluster primitive) is lifted into `packages/core` and runs over a single flow's member set
- [ ] #2 Clustering output is consumed as an **input** to task-27.1.9's chunking — never as the primary organizer; the deterministic file/dir scaffold + call-graph topology are tried first
- [ ] #3 Cross-directory clusters are exposed as a **refactoring-signal** hook for task-27.2 (diagram→code)
- [ ] #4 No schema migration; clusters ride task-27.0's open `kind`/attributes

<!-- AC:END -->

## Open decisions

<!-- SECTION:DECISIONS:BEGIN -->

- **D-CLUSTERING-TRIGGER — when, if ever, does clustering activate in v1?** Options: never in v1 (deterministic chunking only) · only when a flow exceeds the per-view budget · always-on as an alternate lens. _Stake:_ guards against "clustering by the back door" reintroducing the deferred cost; lead is budget-triggered-only.

<!-- SECTION:DECISIONS:END -->

## Implementation Notes

<!-- Added when work begins. -->
