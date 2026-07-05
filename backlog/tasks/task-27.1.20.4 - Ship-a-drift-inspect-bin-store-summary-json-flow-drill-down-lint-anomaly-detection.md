---
id: TASK-27.1.20.4
title: >-
  Ship a drift-inspect bin: store summary, --json, --flow drill-down, --lint
  anomaly detection
status: To Do
assignee: []
created_date: "2026-07-05 13:50"
labels:
  - drift
  - tooling
  - dx
dependencies:
  - TASK-27.1.20.1
  - TASK-27.1.20.3
parent_task_id: TASK-27.1.20
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[No first-party way to inspect sync results] Reconcile stderr goes to the Claude session transcript; the extension has no OutputChannel; no dump/inspect/query script exists anywhere in the repo. The developer must reverse-engineer the SQLite schema and hand-write json_extract queries to answer "did my change do what I expected?". Verified consequence: the live bergamot store contains a probable anomaly (34 flows and a stitch.json beside the DB but ZERO agentic.bridge edges and only 1 flow_member edge, plus 24 placeholder descriptions) that no tool exists to notice.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 drift-inspect summary mode: live/retired flow counts, per-flow members+seeds, description source breakdown (placeholder vs llm), bridges with rationale, deferred retirements
- [ ] #2 --json output and --flow <id> drill-down
- [ ] #3 --lint anomaly detection: flows with 0 members, stitch.json present but 0 bridges persisted, high placeholder:llm ratio
- [ ] #4 Run against ~/workspace/bergamot/.code-charter/graph.db and report whether the 0-bridge-edge anomaly is a real stitch-persistence regression

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Reads the store + the run log from .3. New bin in packages/drift. Reuses the summary rendering later wired into the OutputChannel (.5) and drift:dev (.7).
<!-- SECTION:NOTES:END -->
