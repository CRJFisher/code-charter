---
id: TASK-27.1.15.4
title: >-
  Guard seed-gone retirement against degenerate call graphs and surface
  retirements in reconcile outcomes
status: To Do
assignee: []
created_date: "2026-06-09 21:14"
labels:
  - drift
  - flows
  - robustness
dependencies: []
references:
  - task-27.1.15
  - packages/drift/src/reconcile/affected_flows.ts
  - packages/drift/src/reconcile/reconcile.ts
  - packages/drift/src/bin/drift_reconcile.ts
  - packages/core/src/agentic/headless_project.ts
parent_task_id: TASK-27.1.15
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Seed-gone retirement (introduced by task-27.1.15) runs globally on every reconcile: any live code flow whose entry_points fail to resolve in this run's graph is surfaced (affected_flows.ts:48-50) and soft-deleted (reconcile.ts:148-153), regardless of the turn's changed set. The judgement is made solely against the freshly built whole-repo call graph, and that graph can be wrong without any error: headless_project.ts:77-84 silently omits any file whose read or `project.update_file` throws, and `get_call_graph()` falls back to an empty graph on failure. One bad parse run (e.g. an Ariadne failure over all .py files) would therefore retire every affected flow in a single turn, with only a stderr log line each, recoverable only by re-touching each flow's file. There is no guard between "graph looks degenerate" and "retire" in drift_reconcile.ts.

Compounding this, retirement is unobservable: `resync_persisted_flow` returns undefined on the retire branch (reconcile.ts:146-155), so retirements never appear in `ReconcileResult.outcomes`, the `--json` output, or the "reconciled N flow(s)" summary — the skill consuming the reconcile result cannot see or report that flows were retired.

Two improvements, same path:

1. A graph-health guard: skip (defer) retirement when the graph is degenerate — e.g. the empty-graph fallback fired, files were omitted on parse errors, or the resolution failure rate across persisted flows is implausibly high — logging the reason. Retirement of a healthy flow must require a trustworthy graph.
2. Surface retirements as first-class outcomes in ReconcileResult and the CLI JSON/summary output.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A reconcile run over a degenerate graph (empty-graph fallback, or files omitted due to parse errors) retires no flows; the skip and its reason are logged and visible in the result.
- [ ] #2 A genuine seed-gone retirement appears in ReconcileResult.outcomes and in the drift_reconcile --json output and summary line.
- [ ] #3 Tests cover both: a degenerate-graph run asserts zero retirements; a real rename run asserts the retirement outcome is present in the JSON surface.
- [ ] #4 Full suite green.
<!-- AC:END -->
