---
id: TASK-27.1.15.5
title: Remove the orphaned GraphStore.restore API
status: To Do
assignee: []
created_date: "2026-06-09 21:14"
labels:
  - graph-db
  - simplification
dependencies: []
references:
  - task-27.1.15
  - task-27.1.15.1
  - packages/types/src/graph_store.ts
parent_task_id: TASK-27.1.15
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

`GraphStore.restore`'s only production callers were the `reattach`/`delete` arms of `drift.resolve`, deleted by task-27.1.15 (pre-strip call sites: drift_tool.ts:114 and :134 at c657de6^1; verified the only ones repo-wide). The method now survives across the whole interface chain with zero production callers, exercised only by storage-layer unit tests:

- declaration: packages/types/src/graph_store.ts:200
- implementation: packages/core/src/storage/sqlite_graph_store.ts:356
- stubs: packages/core/src/storage/null_graph_store.ts:56, packages/drift/src/reconcile/dry_run_store.ts:30

Nothing kept needs it: the surviving `reanchor` arm uses `reanchor_node`, `write_descriptions` resurrects via upsert, and `CustomGraphModel`'s doc states "There is no `restore`". Per the no-surplus-code constitution, remove the declaration, implementations, stubs, and the tests that exist only to exercise it (sqlite_graph_store.test.ts:110,315,559; node_sqlite_support.test.ts:51).

This naturally lands with task-27.1.15.1 (part 2, the core relocation/reanchor strip) if that work touches the same storage surface; otherwise it stands alone.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 restore is removed from the GraphStore interface and every implementation (sqlite, null, dry-run); grep over packages/\*/src finds no remaining reference.
- [ ] #2 Tests covering only restore are deleted; assertions that used restore incidentally are rewritten against surviving APIs.
- [ ] #3 Typecheck and full suite green.
<!-- AC:END -->
