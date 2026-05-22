---
id: TASK-22.4
title: Implement VSCode-extension position storage with extension-host save flush
status: To Do
assignee: []
created_date: '2026-05-20 13:50'
updated_date: '2026-05-22 12:03'
labels: []
dependencies:
  - TASK-22.1
  - TASK-22.2
parent_task_id: TASK-22
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Inside VSCode the webview cannot reliably persist on disposal: `retainContextWhenHidden` suppresses the visibilitychange and pagehide events in the webview. The extension host owns position storage, debounces disk writes, and flushes synchronously on panel dispose. A single positions document per chart holds the position overrides for all node types and the chart's graph_content_hash.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Position writes are atomic and isolated per chart, stored at `.code-charter/charts/<sanitized_chart_id>/positions.json`
- [ ] #2 The same positions file holds the position overrides for all node types and the chart's graph_content_hash
- [ ] #3 Filename sanitization is deterministic, collision-free, and safe on macOS, Linux, and Windows-style paths
- [ ] #4 Reading a missing or corrupt file returns null rather than throwing
- [ ] #5 No drag-stop save is lost, including when the panel is closed immediately after a drag
- [ ] #6 Concurrent writes from a second view of the same chart do not silently overwrite each other; the losing write receives a clear conflict response
- [ ] #7 Customization files are excluded from version control by default
<!-- AC:END -->
