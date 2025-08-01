---
id: task-6.7
title: Update VSCode extension to use extracted UI package
status: To Do
assignee: []
created_date: '2025-08-01'
labels: []
dependencies: []
parent_task_id: task-6
---

## Description

Modify the VSCode extension to consume the new @code-charter/ui package instead of the embedded web components, maintaining all existing functionality.

## Acceptance Criteria

- [ ] VSCode extension dependencies updated to include @code-charter/ui
- [ ] Webview content served from the UI package build
- [ ] VSCode backend adapter properly integrated
- [ ] All existing features work as before
- [ ] Extension size reduced by removing duplicate code
