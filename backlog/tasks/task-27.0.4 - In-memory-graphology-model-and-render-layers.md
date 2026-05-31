---
id: TASK-27.0.4
title: "In-memory graphology model and render(layers)"
status: To Do
assignee: []
created_date: "2026-05-30"
labels:
  - architecture
  - graph-db
  - graphology
dependencies:
  - task-27.0.1
  - task-27.0.2
  - task-27.0.3
parent_task_id: TASK-27.0
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The working graph and its composition into a renderable view — the shared in-memory surface both directions and the UI operate on. Hydrates a single graphology `MultiDirectedGraph` from the store, flushes only the changed rows back through the watermark-aware writes (task-27.0.2), and folds the open, ordered layer list into a fresh, non-persisted render graph.

Scope boundary: this delivers the **minimal** `render(layers)` fold and the shared model only. The rich comprehension-map rendering — zoom levels, clustering, React Flow — stays in task-27.1; nothing here bakes in those concerns.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 `CustomGraphModel` hydrates one `MultiDirectedGraph` from `all_nodes`/`all_edges` (`include_deleted: true`), keyed by stable node ids and deterministic edge keys (`addEdgeWithKey`), and flushes only the changed rows back per edit (never re-serializing the whole graph): field-level edits route through `write_fields` (ladder-respecting), full raw rows through `upsert_node`/`upsert_edge` (the latter takes its `ProvenanceRow[]`), soft-deletes through `soft_delete`
- [ ] #2 Soft-delete is honored by convention: no `dropNode`/`dropEdge`; soft-deleted rows (`deleted_at` set) are held in memory and filtered at render unless `show_tombstones` is set
- [ ] #3 `render(layers)` folds an open, ordered `LayerSpec[]` (raw → agentic → user → overlay) into a fresh, non-persisted render graph; later layers win at field granularity **by list order** — a read-only last-wins fold that does **not** consult `field_ownership` or stamp ownership, distinct from the persistence ladder (`write_fields`); overlays are never written back, so the ladder never runs on them. Rows with `deleted_at` set are dropped unless `show_tombstones` (a render-call parameter owned by this task, distinct from the `LayerSpec[]` input) is set
- [ ] #4 A `proposed` overlay (task-27.2) composes as one additional list entry with no `render()` signature change
- [ ] #5 End-to-end on a `:memory:` store: load → user edit → raw re-parse → agentic pass round-trips with the correct tiers preserved and preserved agentic/user rows re-anchored through the resolver (task-27.0.3) so they follow a moved symbol; the raw re-parse is driven by a deterministic fixture raw writer (a stub emitting a few code + literal-doc edges), not the production Ariadne extractor — that wiring is task-27.1's

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

Builds on `@code-charter/core` (task-27.0.1): hydrates from `SqliteGraphStore.all_nodes` / `all_edges` and composes the runtime `LayerSpec[]` in `render()`; both the model and `render()` live in `@code-charter/core`.

1. `CustomGraphModel`: hydrate from the store (deterministic edge keys; `include_deleted`), maintain a dirty set, flush only changed rows via `write_fields` (field-level, ladder-respecting) / `upsert_*` (full raw rows) / `soft_delete`.
2. Field-level watermark merge helper for the persisted flush, because graphology's built-in `merge`/`update` replace attributes at the top level and cannot honor the per-field precedence ladder.
3. `render(layers)`: left-to-right read-only fold, later-wins by list order at field granularity (no `field_ownership` consulted), with `show_tombstones` filtering; overlays compose non-destructively and are never written back.
4. Drive `rebuild_layer('raw')` from a deterministic fixture raw writer (code + literal-doc edges) for the round-trip; production Ariadne extractor wiring is task-27.1's.
5. End-to-end round-trip test on `:memory:`, asserting the in-memory hydrate/flush cycle preserves tiers and re-anchors preserved rows through the resolver (task-27.0.3).

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
