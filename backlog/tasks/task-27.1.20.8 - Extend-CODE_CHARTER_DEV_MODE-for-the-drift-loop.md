---
id: TASK-27.1.20.8
title: Extend CODE_CHARTER_DEV_MODE for the drift loop
status: Done
assignee: []
created_date: "2026-07-05 13:51"
labels:
  - drift
  - vscode
  - dx
dependencies:
  - TASK-27.1.20.5
  - TASK-27.1.20.6
  - TASK-27.1.20.7
parent_task_id: TASK-27.1.20
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[CODE_CHARTER_DEV_MODE does nothing for the drift loop] Dev mode currently toggles only webview command URIs, the find widget, and the UI-bundle watcher — no store instrumentation, verbose logging, DB watching, or inspection affordance for the mechanism actually under development.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Dev mode reveals the OutputChannel and prints a store summary on each generate
- [x] #2 Dev mode watches graph.db and auto-refreshes the webview
- [x] #3 Dev mode exposes Dump Drift Store and Preview Drift Reconcile commands

<!-- AC:END -->

## Implementation Notes

 /build-and-review task-27.1.20.12 - skip cdoc and user review and go from plan to implementation (unless there any major decisions you'd like me to weigh in on)
 <!-- SECTION:NOTES:BEGIN -->

## High-level summary

Dev mode now instruments the drift loop it is used to develop. `CODE_CHARTER_DEV_MODE` (the env flag or the `code-charter-vscode.devMode` setting) previously toggled only webview affordances (command URIs, find widget, UI-bundle watcher); it now also reveals the Code Charter OutputChannel and prints the persisted store's summary, narrates the graph.db watch→refresh cycle, and exposes a Dump Drift Store command. The pieces it composes — the OutputChannel (.5), the always-on graph.db watcher (.6), and the store-inspect projection (.4, reused by .7) — already exist; this task wires them behind the dev flag.

A single `log_store_summary` reads the store in-process and read-only through the same inspect projection the `drift-inspect` bin uses (`read_inspect_input` → `collect_store_summary` → `render_summary`, now that `read_inspect_input` is exported from `@code-charter/drift`), so a cold repo with no store renders an empty summary rather than throwing. Both AC#1's generate-time instrumentation and AC#3's Dump Drift Store command render through it.

### How each acceptance criterion is met

- **AC#1 — reveal + store summary on generate.** `generate_diagram` reveals the channel and calls `log_store_summary` when dev mode is on, printing flow/description/bridge counts and sync health on every generate — distinct from the pre-existing one-line sync-status health line, which still prints for all users.
- **AC#2 — watch graph.db + auto-refresh.** The graph.db watcher and webview auto-refresh ship always-on for every user (task .6); gating them behind dev mode would regress a production feature. Dev mode instead adds verbose narration of the watch→refresh cycle in the watcher callback, so the always-on refresh becomes observable while the loop is under development. Each callback branch (call-graph `invalidate()` vs. a direct webview nudge before any graph is built) narrates the path it actually took.
- **AC#3 — Dump Drift Store + Preview Drift Reconcile commands.** Preview Drift Reconcile already existed. Dump Drift Store is new: it mirrors Preview's shape — a command-id constant in `drift_status.ts`, a `registerCommand` in `activate`, a `contributes.commands` entry, and a `commandPalette` `when: code-charter-vscode.devMode` gate — and re-runs the store summary on demand so a developer can inspect the store after an out-of-process reconcile lands, without a re-generate. Both commands early-return with an info message outside dev mode.

### Notes

- The command keeps the spec name "Dump Drift Store" though it renders a summary rather than raw rows; a raw-dump command can claim a distinct verb later if one is ever needed.
- The dev surface of an open webview panel is fixed at panel creation (matching the existing `enableCommandUris`/`UIDevWatcher` behavior): toggling `devMode` mid-session takes effect on the next generate.

Integration task: composes the OutputChannel (.5), the graph.db watcher (.6), and the drift:dev preview (.7) behind the dev-mode flag.
<!-- SECTION:NOTES:END -->
