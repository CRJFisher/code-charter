---
id: TASK-27.0.1
title: "SQLite GraphStore: schema, persistence, and file-incidence"
status: To Do
assignee: []
created_date: "2026-05-30"
labels:
  - architecture
  - storage
  - graph-db
  - sqlite
dependencies:
  - task-27.0
  - task-21.1
parent_task_id: TASK-27.0
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The persistence half of the shared model. Realizes the merged `GraphStore` contract (`packages/types/src/graph_store.ts`) on Node's built-in `node:sqlite`: the full three-tier schema, the version sentinel and nuke-and-rebuild policy driven by an explicit per-table disposable property, and the row CRUD / query / soft-delete primitives every other 27.0 piece builds on.

It also lands the **file→content incidence** access pattern that task-27.1's drift detection scopes by — file-qualified `symbol_path`, indexed `source_file`/`path`, and the file-scoped read/invalidation methods — so the derived diff signal can be computed cheaply without any drift state living here.

This is the foundation sub-task: 27.0.2 (watermark/rebuild), 27.0.3 (resolver), and 27.0.4 (in-memory model) all build on it.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A `SqliteGraphStore` implements the `GraphStore` interface against `node:sqlite`; it is the only file that imports `node:sqlite`, and nothing downstream binds to the engine directly
- [ ] #2 The schema creates `nodes`, `edges`, `edge_provenance`, `file_hashes`, `anchor_resolution`, `schema_version`, and `table_registry` per the three-tier (raw/agentic/user) model. An anchor is the `nodes.anchor` column (`symbol_path:content_hash`), not its own table; render-layer ordering is the runtime `LayerSpec[]` composed by `render()` (task-27.0.4), not a stored table
- [ ] #3 The store opens only when the host Node version is `>= 22.13.0` (semver compare, not string/numeric); on older or Node-less hosts it degrades gracefully — the constructor returns a store whose reads return empty and whose writes are no-ops, so downstream (task-27.0.4, task-27.1) runs without branching on availability — rather than throwing
- [ ] #4 Node and edge rows round-trip byte-for-byte through upsert/query, including the JSON `attributes` and `field_ownership` columns, the open `origin`/`intent_source` values, and the edge-only `adjudication` column (the irreplaceable accept/reject decision that must never re-surface)
- [ ] #5 `soft_delete`/`restore` set and clear `deleted_at`; there is no hard-DELETE path for agentic/user content; default reads exclude soft-deleted rows and `include_deleted` returns them
- [ ] #6 File→content incidence is cheap and correct: `edges_for_files(paths)` returns exactly the edges whose provenance `source_file` is in `paths`; `invalidate_edges_for_files` / `invalidate_nodes_for_files` remove only raw-tier rows sourced from those files (the diff against prior state is computed before invalidation, never from a persisted stale flag); `symbol_path` is file-qualified and `nodes.path` / `edge_provenance.source_file` are indexed
- [ ] #7 Writes are transactional — a throw mid-batch rolls back (manual `BEGIN`/`COMMIT`/`ROLLBACK`, since `node:sqlite` has no transaction helper)
- [ ] #8 A `schema_version` mismatch drops and recreates only the **tables** `table_registry` marks disposable (the table-granular full rebuild); preserved tables and their rows survive untouched. The `table_registry` table backs the contract's `table_disposition()` method. A new preserved table declares itself with one `table_registry` insert and no change to rebuild code — verified by a test where a table registered as preserved _after_ initial seeding (simulating task-27.2's `pending_edit`) survives a version-mismatch rebuild. (Row-granular per-tier rebuild via `rebuild_layer()` is task-27.0.2's.)
- [ ] #9 Unit tests run against an in-memory (`:memory:`) database and complete in <500 ms; a CI test asserts `node:sqlite` loads on the runner

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Author the DDL from the row interfaces in `packages/types/src/graph_store.ts` (the binding source of column shapes) — the three-tier tables `nodes`/`edges`/`edge_provenance`/`file_hashes`, indexes incl. `idx_nodes_path` and `idx_edge_provenance_file`, and `anchor_resolution` as a disposable cache. (An anchor is the `nodes.anchor` column, not its own table.)
2. Seed `table_registry` (raw rows + `anchor_resolution` = disposable; agentic/user = preserved). Render-layer ordering is not stored — it is the runtime `LayerSpec[]` composed by `render()` (task-27.0.4).
3. Open `node:sqlite` behind a `>= 22.13.0` semver guard; on an unsupported host return the no-op store from AC#3.
4. Implement a manual transaction wrapper (BEGIN/COMMIT/ROLLBACK) and route all multi-row writes through it.
5. Implement node/edge/provenance/file-hash CRUD + queries, soft-delete/restore, and the file-scoped reads/invalidations (`edges_for_files`, `invalidate_edges_for_files`, `invalidate_nodes_for_files`).
6. Implement the disposable-aware schema-version rebuild that consults `table_disposition()` as data (table-granular; per-tier `rebuild_layer()` is task-27.0.2's).
7. `:memory:` round-trip / FK / rollback tests, the post-seeding preserved-table-survives-rebuild test, + the `node:sqlite` load guard.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
