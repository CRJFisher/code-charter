---
id: TASK-14.3
title: Decouple clustering from VS Code APIs
status: Done
assignee: []
created_date: '2026-03-19'
updated_date: '2026-05-24 14:09'
labels: []
dependencies:
  - task-14.1
parent_task_id: TASK-14
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Refactor clustering_service.ts in-place to remove vscode.* dependencies via dependency injection. Define EmbeddingProvider and CacheStorage interfaces. Replace vscode.Uri/vscode.workspace.fs with Node.js fs abstractions. This enables the clustering code to be used from both the VS Code extension and Claude Code hook scripts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ClusteringService has no direct vscode.* imports
- [ ] #2 EmbeddingProvider interface injected (replaces inline OpenAI/local provider initialization)
- [ ] #3 CacheStorage interface injected (replaces vscode.workspace.fs calls)
- [ ] #4 vscode.ExtensionContext dependency removed from ClusteringService
- [ ] #5 Extension adapters provide VS Code implementations of injected interfaces
- [ ] #6 Existing clustering tests pass
- [ ] #7 clustering-tfjs works correctly with the refactored service
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ClusteringService now uses injected EmbeddingProvider and CacheStorage interfaces (clustering_types.ts). vscode_cache_storage.ts is the adapter; fs_cache_storage.ts (deleted with CLI) provided a Node-only implementation.
<!-- SECTION:NOTES:END -->
