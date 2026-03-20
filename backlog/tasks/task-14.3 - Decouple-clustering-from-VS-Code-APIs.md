---
id: task-14.3
title: Decouple clustering from VS Code APIs
status: To Do
assignee: []
created_date: '2026-03-19'
labels: []
dependencies:
  - task-14.1
parent_task_id: task-14
---

## Description

Refactor clustering_service.ts in-place to remove vscode.* dependencies via dependency injection. Define EmbeddingProvider and CacheStorage interfaces. Replace vscode.Uri/vscode.workspace.fs with Node.js fs abstractions. This enables the clustering code to be used from both the VS Code extension and Claude Code hook scripts.

## Acceptance Criteria

- [ ] ClusteringService has no direct vscode.* imports
- [ ] EmbeddingProvider interface injected (replaces inline OpenAI/local provider initialization)
- [ ] CacheStorage interface injected (replaces vscode.workspace.fs calls)
- [ ] vscode.ExtensionContext dependency removed from ClusteringService
- [ ] Extension adapters provide VS Code implementations of injected interfaces
- [ ] Existing clustering tests pass
- [ ] clustering-tfjs works correctly with the refactored service
