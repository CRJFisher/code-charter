---
id: TASK-27.1.20.6
title: "Close the missing final pipeline stage: graph.db change -> webview refresh"
status: To Do
assignee: []
created_date: "2026-07-05 13:51"
labels:
  - drift
  - vscode
dependencies:
  - TASK-27.1.20.1
parent_task_id: TASK-27.1.20
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[Missing final pipeline stage — reported in BOTH review goals, shared root cause] The pipeline contract ends in "flow store update -> UI notification", but that link was never built. extension.ts reads the store only on demand inside list_flows/render_flow; AriadneProjectManager.on_call_graph_changed exists but is never subscribed; UIDevWatcher watches only the UI bundle. So stitched umbrellas and LLM descriptions landing in graph.db out-of-process are invisible until the user manually re-runs Generate Diagram — making it easy to misattribute a stale panel to a broken reconcile. The debounced-watcher pattern already exists in dev_watcher.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Add a vscode.FileSystemWatcher on <workspace>/.code-charter/graph.db, debounced with UIDevWatcher settle logic, posting a store_changed message so the webview re-runs list_flows/render_flow
- [ ] #2 Invalidate project_manager cached call graph on the same event so a reconciled code change is reflected without disposing the panel
- [ ] #3 Keep the store open-per-request model; the watcher only triggers a re-read (read-only connection from .1)

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Files: packages/vscode/src/extension.ts, packages/vscode/src/dev_watcher.ts, packages/vscode/src/ariadne/project_manager.ts. Wires the existing on_call_graph_changed subscription.
<!-- SECTION:NOTES:END -->
