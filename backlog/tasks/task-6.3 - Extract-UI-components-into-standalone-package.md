---
id: task-6.3
title: Extract UI components into standalone package
status: To Do
assignee: []
created_date: '2025-08-01'
labels: []
dependencies: []
parent_task_id: task-6
---

## Description

Move the web components from code-charter-vscode/web into a new @code-charter/ui package, maintaining all functionality while removing direct VSCode dependencies.

## Acceptance Criteria

- [ ] New @code-charter/ui package created with proper structure
- [ ] All React components moved to the new package
- [ ] Components use backend abstraction instead of direct VSCode API
- [ ] Package exports properly configured for library consumption
- [ ] TypeScript definitions generated correctly
