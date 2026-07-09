---
id: TASK-27.1.20.6
title: "Close the missing final pipeline stage: graph.db change -> webview refresh"
status: Done
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

- [x] #1 Add a vscode.FileSystemWatcher on <workspace>/.code-charter/graph.db, debounced with UIDevWatcher settle logic, posting a store_changed message so the webview re-runs list_flows/render_flow
- [x] #2 Invalidate project_manager cached call graph on the same event so a reconciled code change is reflected without disposing the panel
- [x] #3 Keep the store open-per-request model; the watcher only triggers a re-read (read-only connection from .1)

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

A `vscode.FileSystemWatcher` on `<workspace>/.code-charter/graph.db` closes the pipeline's final stage: when an out-of-process reconcile writes the store, the live webview refreshes in place instead of waiting for a manual Generate Diagram. On a settled write the watcher re-extracts the call graph and pushes a `store_changed` message to the webview, which re-runs `list_flows`/`render_flow` for the current selection — the panel is never disposed, and the user's selection and chart viewport survive the refresh. The store stays open-per-request and read-only throughout; the watcher only signals that a re-read is due.

The refresh flows through one channel. `StoreWatcher` (mirroring `UIDevWatcher`'s debounced settle) fires `AriadneProjectManager.invalidate()`, which re-reads the source tree into the live project and fires `on_call_graph_changed`. `extension.ts` subscribes that event — dead until now — and posts `store_changed`. Because the project's own incremental file watchers fire the same event, an in-process source edit refreshes the panel through the identical path. On the webview side the backend gains an `on_store_changed` subscription; `App` silently re-runs `list_flows` and bumps a `refresh_nonce` that re-projects the selected flow and clears the topology-keyed layout cache, so a description-only reconcile repaints.

## Implementation details

- **`store_watcher.ts` (new):** a debounced `FileSystemWatcher` on `graph.db` (1s settle, `onDidChange`/`onDidCreate`, matching `UIDevWatcher`). `dispose()` clears the pending settle timer so a write landing just before panel close can't fire against a torn-down panel. It never opens the store — read-only by construction (AC#3). The reconcile bin closes its store per run, which checkpoints WAL back into `graph.db` and trips the watcher.
- **`AriadneProjectManager.invalidate()`:** re-indexes the source tree in place (shared `index_all_files` with the initial index) and fires `on_call_graph_changed`, keeping the project and its watchers live so the panel is intact (AC#2). It is gated on the initial index having completed, and routed through `run_index()` which serializes concurrent re-indexes and drains a trailing rerun, so overlapping graph.db writes neither interleave `update_file` calls nor drop the last change.
- **`extension.ts`:** creates the `StoreWatcher` per panel, subscribes `on_call_graph_changed` → `post_store_changed`, and disposes both plus the watcher on panel dispose. The store-change callback is wrapped so a failed re-index is logged, never an unhandled rejection.
- **`CodeCharterBackend.on_store_changed` + `VSCodeBackend`/`MockBackend`:** an unsolicited-push subscription; `VSCodeBackend` fans out `store_changed` messages ahead of the id-correlated response routing. The mock never pushes.
- **`App` / `CodeChartArea`:** `load_flows` gains a silent path that keeps the chart mounted on a background push (no Indexing/Error teardown) and promotes to Ready on success (recovering a prior Error); `refresh_nonce` re-runs the render effect and clears the layout cache for the current flow.

Every acceptance criterion is proved by test: AC#1 by `store_watcher.test.ts` (watch/debounce/dispose), `vscode_backend.test.ts` (`store_changed` fan-out), `app.test.tsx` (list_flows re-run + nonce), and `code_chart_area.test.tsx` (nonce re-fires `render_flow` and clears the cache); AC#2 by `ariadne-project-manager-watcher.test.ts` (`invalidate` re-indexes and fires the event); AC#3 by the unchanged read-only, open-per-request read path and a watcher that never opens the store.
<!-- SECTION:NOTES:END -->
