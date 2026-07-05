---
id: TASK-27.1.20.1
title: >-
  SQLite concurrency discipline: WAL + busy_timeout, read-only extension
  connection, single-reconcile lock
status: To Do
assignee: []
created_date: "2026-07-05 13:49"
labels:
  - drift
  - concurrency
  - sqlite
  - critical
dependencies: []
parent_task_id: TASK-27.1.20
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[CRITICAL — root cause flagged independently by two review agents] SqliteGraphStore opens with only PRAGMA foreign_keys=ON while three uncoordinated actors touch graph.db: the Stop-hook reconcile subprocess (writer), a possible concurrent manual /drift reconcile (second writer, last-writer-wins clobber), and the VS Code extension (opens read-write, reads nodes and edges in two separate statements so it can observe torn state). Under the default rollback journal, contention throws SQLITE_BUSY instantly; drift_reconcile.ts exits 1 so the pending set is never consumed — a silently dropped reconcile. This is the foundation for all safe concurrent access.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 SqliteGraphStore constructor sets PRAGMA journal_mode=WAL and PRAGMA busy_timeout=5000 immediately after open (packages/core/src/storage/sqlite_graph_store.ts)
- [ ] #2 Extension store connection opens read-only (extension.ts read_store_rows never writes) so it never competes for the write lock; the nodes+edges fetch is wrapped in one read transaction for a consistent snapshot
- [ ] #3 A process-level reconcile mutex beside the store (O_EXCL wx lockfile in .code-charter/ or BEGIN IMMEDIATE advisory row); a second reconcile waits or exits 0 as a no-op since its files are already unioned into the pending set
- [ ] #4 core, drift, and vscode packages typecheck; store and reconcile suites green

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Files: packages/core/src/storage/sqlite_graph_store.ts, packages/vscode/src/extension.ts, packages/drift/src/bin/drift_reconcile.ts, packages/drift/src/reconcile/reconcile.ts
<!-- SECTION:NOTES:END -->
