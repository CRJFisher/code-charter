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

<!-- SECTION:NOTES:BEGIN -->

### High-level summary

The persisted store (27.0.1/27.0.2) is the durable truth; the UI and both authoring directions need a
single **live, in-memory surface** to read and edit, plus a way to **compose the tiers into one view**.
This task delivers that surface — `CustomGraphModel` — and the minimal `render(layers)` fold, both in
`@code-charter/core`. (Scope: AC#1–#4. AC#5's resolver round-trip lands with task-27.0.3 on its own
branch and is out of scope here.)

Two distinct precedence mechanisms meet here and must not be conflated:

- **The persistence ladder (write-side).** `CustomGraphModel` hydrates one graphology
  `MultiDirectedGraph` from `all_nodes`/`all_edges` (`include_deleted: true`), keyed by stable node ids
  and deterministic edge keys via `addEdgeWithKey`. Edits mutate the in-memory graph and mark only the
  touched rows dirty; `flush()` writes **only those rows** back through the right store door — field
  edits through `write_fields` (which honors the `user > agentic > raw` ownership ladder), full raw rows
  through `upsert_node`/`upsert_edge` (the latter carrying its `ProvenanceRow[]`), removals through
  `soft_delete`. The whole graph is never re-serialized. The field-ladder rule is extracted to one pure
  helper shared by the store and the model, so the in-memory mirror computes the exact same `skipped`
  set the store would.
- **The render fold (read-side).** `render(layers)` folds an open, ordered `LayerSpec[]`
  (raw → agentic → user → overlay) into a **fresh, non-persisted** `MultiDirectedGraph`. Precedence is
  **list order**: later layers win field-by-field. It does **not** consult or stamp `field_ownership` —
  it is a read-only view, distinct from the write-side ladder. Overlays carry their own rows inline and
  are never written back, so the ladder never runs on them. A `proposed` overlay (27.2) is therefore
  just one more list entry — no `render()` signature change.

**Soft-delete is by convention, not by destruction:** the model never calls `dropNode`/`dropEdge`.
Soft-deleted rows (`deleted_at` set) stay in memory and are filtered out at render time unless
`show_tombstones` is passed — a render-call parameter owned by this task, separate from the `LayerSpec[]`
input. Mirroring the store, soft-delete is a no-op on raw-tier rows.

### Approach

- Add `graphology` (`MultiDirectedGraph`) as a `@code-charter/core` dependency; nodes/edges carry their
  full `NodeRow`/`EdgeRow` as a `row` attribute, with the graph key = stable id / edge key.
- Extract the per-field precedence ladder from `SqliteGraphStore.write_fields` into a pure
  `apply_field_ladder` helper, used by both the store and the model (one rule, no divergence).
- `render()` accumulates merged rows per layer in list order (field-wise last-wins on the attribute bag,
  whole-value last-wins on structural columns), then drops tombstoned rows and any edge whose endpoint
  was dropped, before materializing the fresh render graph.
- Unit tests on a `:memory:` store cover hydrate/dirty-flush routing, the ladder-respecting field flush,
  soft-delete-by-convention + `show_tombstones`, the list-order render fold, and the `proposed` overlay
  composing with no signature change.

<!-- SECTION:NOTES:END -->
