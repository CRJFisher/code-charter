---
id: task-6.6
title: Set up hot-reload development workflow
status: To Do
assignee: []
created_date: '2025-08-01'
labels: []
dependencies: []
parent_task_id: task-6
---

## Description

Configure development environment to support hot-reload when developing the UI package alongside the VSCode extension, avoiding the need to rebuild and reinstall on every change.

## Acceptance Criteria

- [ ] Symbolic linking configured between packages during development
- [ ] Webpack dev server works with VSCode extension webview
- [ ] File watchers trigger appropriate rebuilds
- [ ] Changes in UI package immediately reflected in extension
- [ ] Development workflow documented

## Technical Details

### Development Workflow Requirements
- Avoid need to rebuild and reinstall extension on UI changes
- Use symbolic links or workspace protocol for local package references
- Configure webpack to watch UI package source files
- Hot module replacement for React components
- Preserve application state during hot reloads when possible

### Suggested Approach
1. Use npm/yarn workspace protocol (workspace:*) for local dependencies
2. Configure webpack dev server to serve UI assets
3. Point VSCode webview to dev server during development
4. Use webpack's watch mode with appropriate ignore patterns
5. Document the setup process clearly for other developers
