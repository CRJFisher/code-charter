---
id: TASK-14.1
title: Fix existing broken tests and delete dead code
status: Done
assignee: []
created_date: '2026-03-19'
updated_date: '2026-05-24 14:09'
labels: []
dependencies: []
parent_task_id: TASK-14
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prerequisites before migration: fix the ~50 broken tests across UI and vscode packages, delete confirmed dead files (clustering_service_old.ts, run.ts, webviewApi.ts, git.ts), remove obviously unused dependencies (@tensorflow/tfjs-node, @xenova/transformers, @vscode/python-extension, babel deps). This cleans the slate for safe migration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All existing tests pass (zero failures)
- [ ] #2 Dead files deleted: clustering_service_old.ts run.ts webviewApi.ts git.ts
- [ ] #3 Unused deps removed: @tensorflow/tfjs-node @xenova/transformers @vscode/python-extension babel-*
- [ ] #4 Build succeeds after cleanup
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dead files removed during CLI deletion and snake_case migration. No clustering_service_old.ts, run.ts, webviewApi.ts, or git.ts remain. Tests across packages have been updated/maintained in subsequent work.
<!-- SECTION:NOTES:END -->
