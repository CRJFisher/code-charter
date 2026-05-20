---
id: TASK-22.4
title: Implement VSCode-extension position storage with extension-host save flush
status: To Do
assignee: []
created_date: "2026-05-20 13:50"
labels: []
dependencies:
  - TASK-22.2
parent_task_id: TASK-22
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Inside VSCode the webview cannot reliably persist on disposal, since `retainContextWhenHidden` suppresses the visibilitychange and pagehide events that would otherwise fire. The extension host owns position storage, debounces disk writes, and flushes synchronously on panel dispose. Positions for one chart live in `functions.json` under that chart's directory.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Position writes are atomic and isolated per chart, stored at `.code-charter/charts/<sanitized_chart_id>/functions.json`
- [ ] #2 Filename sanitization is deterministic, collision-free, and safe on macOS, Linux, and Windows-style paths
- [ ] #3 Reading a missing or corrupt file returns null rather than throwing
- [ ] #4 No drag-stop save is lost, including when the panel is closed immediately after a drag
- [ ] #5 Concurrent writes from a second view of the same chart do not silently overwrite each other; the losing write receives a clear conflict response
- [ ] #6 Customization files are excluded from version control by default
<!-- AC:END -->
