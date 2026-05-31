---
id: TASK-27.0.1
title: "SQLite GraphStore: schema, persistence, and file-incidence"
status: Done
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

- [x] #1 A `SqliteGraphStore` implements the `GraphStore` interface against `node:sqlite`; it is the only file that imports `node:sqlite`, and nothing downstream binds to the engine directly
- [x] #2 The schema creates `nodes`, `edges`, `edge_provenance`, `file_hashes`, `anchor_resolution`, `schema_version`, and `table_registry` per the three-tier (raw/agentic/user) model. An anchor is the `nodes.anchor` column (`symbol_path:content_hash`), not its own table; render-layer ordering is the runtime `LayerSpec[]` composed by `render()` (task-27.0.4), not a stored table
- [x] #3 The store opens only when the host Node version is `>= 22.13.0` (semver compare, not string/numeric); on older or Node-less hosts it degrades gracefully — the constructor returns a store whose reads return empty and whose writes are no-ops, so downstream (task-27.0.4, task-27.1) runs without branching on availability — rather than throwing
- [x] #4 Node and edge rows round-trip byte-for-byte through upsert/query, including the JSON `attributes` and `field_ownership` columns, the open `origin`/`intent_source` values, and the edge-only `adjudication` column (the irreplaceable accept/reject decision that must never re-surface)
- [x] #5 `soft_delete`/`restore` set and clear `deleted_at`; there is no hard-DELETE path for agentic/user content; default reads exclude soft-deleted rows and `include_deleted` returns them
- [x] #6 File→content incidence is cheap and correct: `edges_for_files(paths)` returns exactly the edges whose provenance `source_file` is in `paths`; `invalidate_edges_for_files` / `invalidate_nodes_for_files` remove only raw-tier rows sourced from those files (the diff against prior state is computed before invalidation, never from a persisted stale flag); `symbol_path` is file-qualified and `nodes.path` / `edge_provenance.source_file` are indexed
- [x] #7 Writes are transactional — a throw mid-batch rolls back (manual `BEGIN`/`COMMIT`/`ROLLBACK`, since `node:sqlite` has no transaction helper)
- [x] #8 A `schema_version` mismatch drops and recreates only the **tables** `table_registry` marks disposable (the table-granular full rebuild); preserved tables and their rows survive untouched. The `table_registry` table backs the contract's `table_disposition()` method. A new preserved table declares itself with one `table_registry` insert and no change to rebuild code — verified by a test where a table registered as preserved _after_ initial seeding (simulating task-27.2's `pending_edit`) survives a version-mismatch rebuild. (Row-granular per-tier rebuild via `rebuild_layer()` is task-27.0.2's.)
- [x] #9 Unit tests run against an in-memory (`:memory:`) database and complete in <500 ms; a CI test asserts `node:sqlite` loads on the runner

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

<!-- SECTION:NOTES:BEGIN -->

### Approach

Realized the `GraphStore` contract (`packages/types/src/graph_store.ts`) on `node:sqlite` in a **new
`packages/core` library** (decided with the maintainer; the store has no vscode coupling and is the
shared home for the 27.0.2/3/4 resolver/model/render work). Updated the contract docstring to name
`@code-charter/core` as the impl home.

### Key decisions / trade-offs

- **Table disposition (AC#8):** tiers are the `layer` column inside `nodes`/`edges`, not separate
  tables, so those tables hold irreplaceable agentic/user rows and are **preserved**. Only the pure
  derived cache `anchor_resolution` is disposable. The schema-version rebuild drops/recreates
  disposable tables driven by `table_registry` as data + a code-side DDL map; a table registered
  preserved _after_ seeding (the `pending_edit` test) survives with no rebuild-code change.
- **File incidence (AC#6):** `edges_for_files` / `invalidate_*` use **ANY-provenance match**;
  invalidation hard-deletes only `layer='raw'` rows and returns `void` (the contract's shape — the
  diff is read via `edges_for_files` _before_ invalidation, never persisted). `PRAGMA foreign_keys
  = ON` + `ON DELETE CASCADE` + an explicit provenance delete keep provenance from orphaning.
- **Degraded host (AC#3):** `is_node_sqlite_supported` does a numeric semver tuple compare (no
  lexical trap) against `MIN_NODE_SQLITE_VERSION = 22.13.0`; `open_graph_store` lazily `require`s the
  engine only when supported, else returns a `NullGraphStore` null-object — so the engine is never
  imported on an unsupported host and downstream never branches on availability.
- **Transactions (AC#7):** a re-entrant `BEGIN`/`COMMIT`/`ROLLBACK` wrapper (a single `in_transaction`
  flag, since SQLite forbids a nested `BEGIN`), so `upsert_edge` inside `rebuild_layer`'s callback
  reuses the open transaction; a failing `ROLLBACK` never masks the original error.
- **Type safety at the SQLite boundary:** `node:sqlite` returns `Record<string, SQLOutputValue>`; the
  row mappers narrow via fail-loud accessors (`as_text`/`as_text_or_null`/`as_num`/`as_layer`) and
  validate JSON columns parse to objects, avoiding `as unknown`/`as any` casts.
- `write_fields` (the tier ladder) and a minimal correct `rebuild_layer` are implemented because the
  single-file interface requires them; the watermark-driven _invocation_ of `rebuild_layer` is
  deferred to task-27.0.2 (marked with a TODO).

### Review hardening (10-agent pass)

A ten-reviewer pass (contract conformance, AC completeness, SQL/transactions, file-incidence, schema
rebuild, type safety, test quality, information architecture, build/packaging, conventions) found no
critical defects. Applied fixes:

- `file_changed_since_recorded` returns `true` for a deleted recorded file instead of throwing (a
  deletion is the clearest change signal, matching the degraded store).
- `seed_registry` upserts disposition (`ON CONFLICT … DO UPDATE`) so a future version can flip a
  table's disposition; externally-registered tables still survive untouched.
- `invalidate_nodes_for_files` runs in a transaction, symmetric with the edge counterpart.
- JSON columns fail loud if they don't parse to an object; `as_layer` validates the tier union at the
  boundary (no unchecked `as Layer`).
- The transaction wrapper guards `ROLLBACK` so a rollback failure never masks the original error.
- `npm run build` uses `tsconfig.build.json` (`rootDir: src`, no source-path alias) so it emits a
  clean `dist/index.js`; root `engines.node` raised to `>=22.13.0`.
- Added tests for `neighborhood` (depth/cycle/soft-delete), edge soft-delete/restore/`include_deleted`,
  `write_fields` on an edge, file-DB durability across reopen, deleted-file detection, empty-path
  no-ops, null-anchor/null-attribute round-trip, node-path invalidation scoping, a disposable
  post-seed table being dropped, and an AC#9 timing assertion.

### Verification

`packages/core`: 38/38 Jest tests pass (`:memory:` + file-backed), each DB case 1–16 ms; the AC#9
timing test asserts a representative batch completes < 500 ms. `npm run build`, `tsc --noEmit`, and
`eslint` are clean; `types`/`ui`/`vscode` typecheck unaffected. `node:sqlite` is imported in exactly
one file (`sqlite_graph_store.ts`). `@types/node` is `^22` (root + core). `.github/workflows/ci.yml`
runs on Node 22.13.0 (`npm test`/`typecheck`/`lint`) and asserts `node:sqlite` loads on the runner.

### Added / modified files

- New: `packages/core/{package.json,tsconfig.json,tsconfig.build.json,jest.config.js}`,
  `packages/core/src/index.ts`,
  `packages/core/src/storage/{sqlite_graph_store,null_graph_store,node_sqlite_support,schema}.ts`
  + colocated `*.test.ts`.
- New: `.nvmrc`, `.github/workflows/ci.yml`.
- Modified: `packages/types/src/graph_store.ts` (impl-home docstrings → `@code-charter/core`), root
  `tsconfig.json` (core reference + path alias), root `package.json` (`@types/node` ^22, engines), and
  the sibling task docs (27.0, 27.0.2–4) with a `@code-charter/core` "builds on" pointer.

### Backlog note

This task's frontmatter lists dependency `task-21.1`, which has no task file (only `task-21`
exists) — likely a typo; it did not block the work.

<!-- SECTION:NOTES:END -->
