---
id: TASK-27.1.15.4
title: >-
  Guard seed-gone retirement against degenerate call graphs and surface
  retirements in reconcile outcomes
status: Done
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

- [x] #1 A reconcile run over a degenerate graph (empty-graph fallback, or files omitted due to parse errors) retires no flows; the skip and its reason are logged and visible in the result.
- [x] #2 A genuine seed-gone retirement appears in ReconcileResult.outcomes and in the drift_reconcile --json output and summary line.
- [x] #3 Tests cover both: a degenerate-graph run asserts zero retirements; a real rename run asserts the retirement outcome is present in the JSON surface.
- [x] #4 Full suite green.
<!-- AC:END -->

## Implementation Notes

## High-level summary

Seed-gone retirement is scoped to the changed set: `affected_persisted_flows` surfaces a seed-gone code flow for retirement only when this turn's changed files include the seed's defining file (parsed from the stored `entry_points` symbol_paths via `stored_seed_files`/`file_of_symbol_path`). An unrelated edit — or a degenerate whole-repo graph — can never retire a flow whose code was not touched; an unimplicated seed-gone flow simply lingers, unsurfaced, until its file next changes. Retirement is on-demand, never a global sweep. (task-27.1.20.11 later adds a guarded global stale-flow sweep for the unimplicated cases; this scoped pass remains the eager path.)

Where a flow IS implicated, retiring still requires trustworthy evidence. `resync_persisted_flow` defers (no store write, reason recorded) when the call graph came back empty, when the seed's file was omitted by a read/index failure (`HeadlessProject` records omissions and exposes them through `adapter.omitted_files()`), or when the file is still on disk but yields zero indexed symbols — a mid-edit syntax error typically parses without throwing and just drops the definitions, so the zero-symbols check is what catches real breakage. A partially broken file that still yields some symbols is indistinguishable from a genuine deletion and retires; the flow re-hydrates under the same id once the file parses again, which bounds the damage. Deferral is retried naturally on the next turn that touches the file.

Retirements are first-class: `FlowAction` gains `retire`, the retire branch emits an outcome record (visible verbatim in `drift_reconcile --json`), `ReconcileResult.deferred_retirements` carries each skip with its reason, and the CLI summary counts both (`reconciled N flow(s) (R retired) over M file(s); deferred K retirement(s)`). The drift-sync SKILL.md documents the `hydrate`/`resync`/`retire` vocabulary, the retire record's degenerate fields, and the linger-vs-defer distinction.

### How the acceptance criteria were addressed

- **#1** — degenerate-graph runs retire nothing: the empty-graph case defers with reason "empty call graph"; a genuinely broken seed file defers with "seed file present but yields no indexed symbols"; both reasons are logged and returned in `deferred_retirements`.
- **#2** — the rename run's retirement appears in `ReconcileResult.outcomes`, in the bin's `--json` output, and in the summary line (`drift_reconcile.test.ts` pins the bin surface end-to-end).
- **#3** — covered cases: empty-graph zero retirements, real broken-source deferral, changed-set scoping (unrelated edit never retires; the implicating turn does), deferred-then-completed retirement, and retirement-in-JSON.
- **#4** — full suite green (the drift `test` script runs each Ariadne-heavy suite in its own process; see task-27.1.15.2 notes).

