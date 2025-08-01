---
id: task-6.4
title: Implement flexible theme system for multiple contexts
status: To Do
assignee: []
created_date: '2025-08-01'
labels: []
dependencies: []
parent_task_id: task-6
---

## Description

Create a theme system that works with VSCode CSS variables in webview context and provides default/custom themes for standalone deployment.

## Acceptance Criteria

- [ ] Theme provider interface supporting multiple theme sources
- [ ] VSCode theme adapter using CSS variables
- [ ] Default light and dark themes for standalone usage
- [ ] Theme switching functionality in standalone mode
- [ ] All components properly styled in all contexts

## Technical Details

### Current Theme Implementation

- Uses VSCode CSS variables (--vscode-editor-*) throughout
- Tailwind config references these variables for consistency
- colorTheme.ts reads CSS variables at runtime

### Required Abstraction

- Theme provider that can switch between:
  - VSCode CSS variables when in webview
  - Custom theme implementation for standalone
  - User-configurable themes
- Maintain the same theme keys for consistency
- Support dynamic theme switching in standalone mode
