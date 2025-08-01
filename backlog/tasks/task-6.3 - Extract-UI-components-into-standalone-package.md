---
id: task-6.3
title: Extract UI components into standalone package
status: In Progress
assignee:
  - '@claude'
created_date: '2025-08-01'
updated_date: '2025-08-01'
labels: []
dependencies: []
parent_task_id: task-6
---

## Description

Move the web components from code-charter-vscode/web into a new @code-charter/ui package, maintaining all functionality while removing direct VSCode dependencies.

## Acceptance Criteria

- [x] New @code-charter/ui package created with proper structure
- [x] All React components moved to the new package
- [x] Components use backend abstraction instead of direct VSCode API
- [x] Package exports properly configured for library consumption
- [x] TypeScript definitions generated correctly

## Implementation Plan

1. Analyze packages/vscode/web structure and components
2. Move React components from web/src to packages/ui/src/components
3. Update imports to use backend abstraction instead of vscodeApi
4. Move and adapt styles/CSS files
5. Update build configuration for the UI package
6. Configure proper exports in index.tsx
7. Test that components work with mock backend
8. Update VSCode extension to import from UI package
