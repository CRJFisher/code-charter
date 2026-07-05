---
id: TASK-27.1.20.8
title: Extend CODE_CHARTER_DEV_MODE for the drift loop
status: To Do
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

- [ ] #1 Dev mode reveals the OutputChannel and prints a store summary on each generate
- [ ] #2 Dev mode watches graph.db and auto-refreshes the webview
- [ ] #3 Dev mode exposes Dump Drift Store and Preview Drift Reconcile commands

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Integration task: composes the OutputChannel (.5), the graph.db watcher (.6), and the drift:dev preview (.7) behind the dev-mode flag.
<!-- SECTION:NOTES:END -->
