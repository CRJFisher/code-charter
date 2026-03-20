---
id: task-14.1
title: Fix existing broken tests and delete dead code
status: To Do
assignee: []
created_date: '2026-03-19'
labels: []
dependencies: []
parent_task_id: task-14
---

## Description

Prerequisites before migration: fix the ~50 broken tests across UI and vscode packages, delete confirmed dead files (clustering_service_old.ts, run.ts, webviewApi.ts, git.ts), remove obviously unused dependencies (@tensorflow/tfjs-node, @xenova/transformers, @vscode/python-extension, babel deps). This cleans the slate for safe migration.

## Acceptance Criteria

- [ ] All existing tests pass (zero failures)
- [ ] Dead files deleted: clustering_service_old.ts run.ts webviewApi.ts git.ts
- [ ] Unused deps removed: @tensorflow/tfjs-node @xenova/transformers @vscode/python-extension babel-*
- [ ] Build succeeds after cleanup
