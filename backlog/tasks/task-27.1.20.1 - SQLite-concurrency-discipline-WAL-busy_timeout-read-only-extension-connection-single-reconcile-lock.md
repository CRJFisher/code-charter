---
id: TASK-27.1.20.1
title: >-
  SQLite concurrency discipline: WAL + busy_timeout, read-only extension
  connection, single-reconcile lock
status: Done
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

- [x] #1 SqliteGraphStore constructor sets PRAGMA journal_mode=WAL and PRAGMA busy_timeout=5000 immediately after open (packages/core/src/storage/sqlite_graph_store.ts)
- [x] #2 Extension store connection opens read-only (extension.ts read_store_rows never writes) so it never competes for the write lock; the nodes+edges fetch is wrapped in one read transaction for a consistent snapshot
- [x] #3 A process-level reconcile mutex beside the store (O_EXCL wx lockfile in .code-charter/ or BEGIN IMMEDIATE advisory row); a second reconcile waits or exits 0 as a no-op since its files are already unioned into the pending set
- [x] #4 core, drift, and vscode packages typecheck; store and reconcile suites green

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

Three uncoordinated actors touch `.code-charter/graph.db`: the Stop-hook reconcile subprocess, a possible concurrent manual reconcile, and the VS Code extension's webview reads. Under SQLite's default rollback journal any contention throws `SQLITE_BUSY` instantly, killing a reconcile mid-run; the extension additionally opened read-write (its open ran schema init — a write) and read nodes and edges in two separate statements, so it could observe a torn pair.

The discipline has three layers, each owning one contention class. At the connection level, the `SqliteGraphStore` constructor sets `busy_timeout=5000` first (so the WAL switch itself waits on a contended lock) and then `journal_mode=WAL`; writers take their transaction lock at `BEGIN IMMEDIATE`, because a deferred transaction that upgrades to its first write mid-flight gets `SQLITE_BUSY` back without the busy handler ever running — the sharpest hole WAL alone does not close. At the reader level, pure readers (the extension's `read_store_rows`, `stitch_eval`'s store read) open with `{ read_only: true }` — no schema init, no write-lock competition — and fetch through the new `GraphStore.snapshot()`, which reads nodes and edges inside one deferred transaction. At the process level, every store-mutating bin run holds `drift_reconcile.lock` beside the store: a pid-stamped lockfile created atomically (temp-file + hard-link, so a crash can never leave an unparseable empty lock) with dead-pid reclaim, released on every exit path including open failures.

The front door for the whole story is `packages/drift/src/reconcile/reconcile_lock.ts`; connection discipline lives in the `SqliteGraphStore` constructor and `with_transaction`; the bin's `main()` wires acquisition, and `--dry-run` opens the connection itself read-only so "dry" holds at the connection level.

One deliberate deviation from AC#3's literal text: a contending reconcile exits **1**, not 0. `drift_sync.js` deletes the pending handoff file on any exit-0 non-dry run, so an exit-0 no-op would consume the staged set over work that never ran — reintroducing the exact dropped-reconcile bug this task closes. Exit 1 preserves the pending file for the next launch; the skill contract documents contention as a defer, not a failure. Residual sharp edges: a filesystem that refuses WAL (some network mounts) degrades to a rollback journal rather than failing the open, and the stale-lock reclaim narrows (not eliminates) its rm-vs-recreate race — the leftover window degrades to transaction-level serialization, never corruption.

### Implementation details

- `packages/types/src/graph_store.ts` — `snapshot()` added to the `GraphStore` interface; implemented by `SqliteGraphStore` (one `BEGIN DEFERRED` transaction), `NullGraphStore` (empty), and the dry-run wrapper (pass-through).
- `packages/core/src/storage/sqlite_graph_store.ts` — constructor takes `{ read_only?: boolean }` (skips WAL switch, `foreign_keys`, and schema init; a read-only open of a missing file throws, so callers guard with `existsSync`); `with_transaction` gained a begin-mode parameter defaulting to `BEGIN IMMEDIATE`.
- `packages/core/src/index.ts` — `open_graph_store(db_path, opts?)` threads the option through.
- `packages/vscode/src/extension.ts` — `read_store_rows` opens read-only and calls `snapshot()`.
- `packages/drift/src/reconcile/reconcile_lock.ts` (new) — `acquire_reconcile_lock` polls up to 10s (env-overridable via `DRIFT_RECONCILE_LOCK_WAIT_MS`, a test seam), reclaims dead-pid locks with a content re-verify before removal, and never steals a lock whose owner is unknown.
- `packages/drift/src/bin/drift_reconcile.ts` — payload validation hoisted above lock acquisition so no exit-2 path bypasses release; `open_reconcile_store` releases the mutex if the store open throws; dry-run uses a read-only connection (or the degraded empty store on a cold repo).
- `packages/drift/src/reconcile/dry_run_store.ts` — export renamed `read_only_store` → `dry_run_store`: the old name collided with the genuine read-only connection mode and the two have opposite failure shapes (swallow vs. throw).
- `packages/drift/src/bin/stitch_eval.ts` — its pure reader migrated to read-only + `snapshot()`.
- `packages/drift/jest.config.js` — the ts-jest `tsconfig` path fixed to `<rootDir>/tsconfig.jest.json`; the old repo-root-relative path made every drift suite fail when jest ran from the package dir (pre-existing, blocking AC#4).
- `packages/drift/src/reconcile/reconcile.ts` (named in scope) needed no change — the mutex belongs at the bin boundary, spanning Ariadne indexing plus all store transactions, not inside the engine.
- Docs: the drift-sync `SKILL.md` exit-code contract and the bin header document contention exit-1 as a defer; the `drift-reconciler` agent brief instructs defer-not-fail; the drift README names the lockfile and its safe-to-delete rule.
- Tests: WAL persisted on fresh open and on rollback-journal upgrade; `busy_timeout` read back on the store's own connection; a subclass-interleave test proves `snapshot()` pins one transaction while a writer commits mid-read; read-only opens reject writes and throw on missing files; lock unit tests cover contend/reclaim/never-steal/idempotent-release; bin tests cover held-lock exit-1 (store untouched, foreign lock preserved), stale-lock reclaim, release after success and after a post-acquisition fatal, and dry-run touching neither lock nor db.
<!-- SECTION:NOTES:END -->
