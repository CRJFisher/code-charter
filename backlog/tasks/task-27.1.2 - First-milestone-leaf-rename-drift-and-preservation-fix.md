---
id: TASK-27.1.2
title: "First-milestone vertical slice: leaf rename drift and the preservation fix"
status: Done
assignee: []
created_date: "2026-05-31"
labels:
  - architecture
  - consistency
  - mcp
  - hooks
  - ui
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.0.1
  - task-27.0.3
  - task-27.0.4
  - task-27.1.1
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The earliest end-to-end vertical slice of task-27.1, delivering `doc-5`'s **first milestone**: rename a script/function in the code; the `Stop` hook detects the drift and the `SessionStart` banner then flags exactly one drifted node on the next session open; the hand-written description carries across to the renamed symbol intact (pure auto-sync — no manual accept step).

This slice is **leaf-only** — it touches a single code symbol, never a flow or the deferred clustering/zoom hierarchy — so it can land before the flow entity (task-27.1.3) and the agentic detector. Its real value is validating the **seam contracts** the rest of task-27.1 and all of task-27.2 build on, end to end on real plumbing: the persisted store + the anchor resolver + the named re-extraction funnel + the `drift.resolve` MCP write + a host hook + the `CustomGraph`→React Flow adapter + position-preserving layout + selection-driven provenance. The adapter is built to render **one bounded subgraph** — which task-27.1.3 generalizes to "render a flow" — not a slice of a whole-repo map.

It also lands the **preservation-boundary fix** — the one hard data-loss bug inherited from the task-27.0.2 review — because the fix is a prerequisite for any agentic rebuild (task-27.1.4) and the milestone itself exercises a preserved description surviving re-extraction.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 **Preservation fix:** the layer-promotion lives in the **two `write_fields` wrappers** (the `SqliteGraphStore.write_fields` AND `CustomGraphModel.write_fields`), **not** in the shared `apply_field_ladder` helper (which stays field-bag-only, preserving store/model parity). Each wrapper, when it stamps a field `user`-owned, also promotes the row's structural `layer` to `user`, so the row vacates the rebuild-eligible layer. A user-owned field on a `layer='agentic'` node survives a `rebuild_layer('agentic')` whose writer does not re-emit that node's id (test: write node at `layer='agentic'`, `write_fields` `as_tier='user'` on its `description`, rebuild without re-emitting, assert node + description still present). The task-27.0.1 `write_fields` contract docstring is updated; `render()` composes correctly with the node at `layer='user'`. Note: promotion is one-directional, so the agentic pass (task-27.1.4) refreshes a promoted node's agentic-owned fields by re-targeting it via `write_fields`, not by re-emit
- [ ] #2 **Single re-extraction entry point:** re-extraction of a file set is reachable through exactly one named in-process function `re_extract(file_set, origin)`; the `Stop`-hook reconciliation path (via the `drift-reconciler` sub-agent's `drift-sync` skill) and the consistency engine are its only callers, each passing `origin='code-change'`; the signature is open to further `origin` values (task-27.2's `origin='apply'`) with no signature change
- [ ] #3 On a leaf code-symbol rename, the resolver (task-27.0.3) reports `relocated`; session open surfaces **exactly one** drifted node for it (no false positives on unrelated symbols)
- [ ] #4 Accepting via `drift.resolve` re-anchors the preserved hand-written `description` onto the renamed symbol **untouched**, and the re-render shows it on the new symbol
- [ ] #5 A `SessionStart` banner reports the outstanding drift count and the drifted node as a punch-list item
- [ ] #6 The `CustomGraph`→React Flow adapter renders leaf nodes from `render(layers)` output, mapping `attributes.description` to the node label; soft-deleted rows excluded unless `show_tombstones`. The adapter resolves the React Flow node `type` from `NodeRow.kind` via an **open registry** (kind→component map), not a hardcoded `code_function`/`module_group` branch (today `zoom_aware_node_types` is a closed 2-key object), so shaped flowchart nodes (task-27.1.11) and doc nodes (task-21.2) are registry entries, not adapter edits. Edge styling maps an **open attribute set** (`confidence` + `extractor` + `kind` + `label`/`role`) to style through one path, so a later semantic edge label (task-27.1.11) or cross-modal tint reads through the same function, not a per-edge-class fork
- [ ] #7 `apply_hierarchical_layout` accepts an optional set of fixed node ids; for those ids it emits fixed-position ELK `layoutOptions` and skips the position overwrite; this slice's caller passes an empty set (so behaviour is unchanged here, but the seam exists for task-27.2)
- [ ] #8 Provenance click-through is driven off React Flow's `onSelectionChange`/`selected`, not by overloading the per-node `navigate_to_file` `onClick`; `navigate_to_file` remains available as a secondary action
- [ ] #9 **File-module first-parent tier:** leaf nodes are grouped under one `agentic.group` per defining file, derived deterministically from each leaf's anchor (`symbol_path` before `#`), persisted with `agentic.contains` edges (leaf→module) and a path-based group id (no anchor-set hash, no clustering); files resolving outside the analyzed root bucket under a single `<external>` group. The adapter (AC#6) renders this one real parent tier above the leaves. The scaffold is built for the file set under consideration (the changed/worked-on files), not eagerly across the whole repo; because it is deterministic and path-derived it is cheap to (re)compute on demand

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. **Preservation fix (lands first):** in `packages/core`, extend `write_fields`/`apply_field_ladder` so stamping a field `user`-owned also promotes the row's `layer` to `user`; update the contract docstring in `packages/types/src/graph_store.ts`; verify the `render()` fold (task-27.0.4) still places the node correctly. Record the rejected candidates (re-emit kept rows; ownership-aware `rebuild_layer` guard) per the parent decision.
2. **`re_extract(file_set, origin)`** named entry point in `packages/core`: invalidate only raw rows for the file set (`invalidate_*_for_files`), re-run extractors, write back; the resolver re-anchors preserved rows. The single attributed funnel resolves the apply/`FileChanged` double-fire hazard.
3. **Leaf diff signal:** for the changed file set, resolve each preserved-content anchor through task-27.0.3's resolver; a `relocated`/`downgrade` verdict produces one drift observation.
4. **`drift.resolve`** consumed from task-27.1.1's MCP server; the re-anchor resolution writes the new `symbol_path` while the `user`-owned `description` is preserved by the ladder.
5. **`SessionStart` banner** via task-27.1.1's hook installer.
6. **Adapter** `custom_graph_to_react_flow(graph, ...)` in `packages/ui` superseding the `CallableNode`-based pipeline for leaf nodes; selection-driven provenance panel.
6a. **File-module scaffold:** add `file_module_resolver` + the `ModuleResolver` seam in `packages/core/src/model/module_scaffold.ts`; emit one `agentic.group` per file with `agentic.contains` leaf edges (deterministic, path-id, `<external>` bucket); the adapter (step 6) renders the module tier as the leaves' first parent. No directory rollups, no clustering (those are task-27.1.3).
7. **Position-preserving `apply_hierarchical_layout`** (the one concrete layout change called out in section G).
8. **End-to-end milestone test** on a fixture repo: hand-write a description → rename the symbol → re-open → assert one drift row → accept → assert description on the renamed symbol.

<!-- SECTION:PLAN:END -->

## Implementation Notes

## High-level summary

**Why this exists.** This is the first vertical slice of task-27.1 — doc-5's first milestone: rename a leaf code symbol, and on the next session open exactly one drifted node is flagged while the hand-written description carries onto the renamed symbol intact. Its value is **seam validation** — exercising the persisted store, the anchor resolver, a single named re-extraction funnel, the `drift.resolve` write, the SessionStart banner, the `CustomGraph`→React Flow adapter, position-preserving layout, and selection-driven provenance — so the rest of task-27.1 and all of task-27.2 build on contracts that are proven, not assumed. It is **leaf-only**: one code symbol, never a flow or the deferred clustering/zoom hierarchy.

**The re-sync model (how the description follows a rename).** A code rename re-syncs **out-of-band and automatically**: the Stop-hook reconcile path runs `re_extract`, which re-extracts the file's raw tier and asks the resolver where each preserved (non-raw, anchored) node's symbol now lives. A `relocated` verdict (the body is unchanged, so its `content_hash` matches at a new `symbol_path`) is **staged** on the node — recorded under reserved `drift_*` attributes, leaving the node live with its now-stale anchor. The SessionStart banner surfaces it as one punch-list item, and `drift.resolve {reanchor}` commits the staged re-anchor: the new `symbol_path` is written and the `user`-owned `description` rides across byte-for-byte untouched. The resolution is deterministic and authoring-free (the "auto-sync — no manual *authoring* step" the milestone promises), but moving hand-written content onto a different symbol is surfaced for an explicit one-click accept rather than applied silently. A `miss` (renamed **and** re-bodied) instead soft-deletes the node into the re-attachment bin for manual re-attachment.

**What it ships.**

- **Preservation fix (`packages/core`/`packages/types`, AC#1).** Stamping a field `user`-owned in **either `write_fields` wrapper** (`SqliteGraphStore.write_fields` and `CustomGraphModel.write_fields`) also promotes the row's structural `layer` to `'user'`, so a later `rebuild_layer('agentic'|'raw')` — which deletes by `layer` — can never destroy user-owned content. Promotion is one-directional and lives in the wrappers; the shared `apply_field_ladder` stays field-bag-only, preserving store/model parity. The model's deferred `flush` persists the promotion automatically because it replays the user-tier write through the store's promoting `write_fields`. The `GraphStore.write_fields` contract docstring records this.

- **`re_extract(file_set, origin)` funnel (`packages/core`, AC#2/#3).** The single named in-process re-extraction entry point: invalidate the file set's raw rows, re-extract (the host injects `extract_raw`/`build_index` via `ReExtractDeps`, keeping core parser-agnostic), rebuild the file-module scaffold, then resolve each preserved anchor — `relocated` → stage drift, `miss` → bin, `hit` → no-op (so unrelated symbols never false-positive). The `origin` union is open (`'code-change'` now, task-27.2's `'apply'` adds no signature change). `re_extract` is re-runnable after a partial failure (each store call is atomic and idempotent).

- **Re-anchor write (`packages/core`, AC#4).** `reanchor_node` rewrites only the `anchor` column and strips the `drift_*` staging, leaving the id, layer, and every authored field intact. `outstanding_drift` is the read-only, extractor-free query over staged relocations; both the banner and the resolve handler read from it, so neither re-runs the extractor.

- **File-module tier (`packages/core`, AC#9).** `module_scaffold.ts` emits one `agentic.group` per defining file with `agentic.contains` (leaf → module) edges, a path-derived deterministic group id (no hash, no clustering), and a single `<external>` bucket for files outside the analyzed root. It is rebuilt per worked-on file set via idempotent scoped upserts (not `rebuild_layer`, which is store-global); a renamed-away leaf's stale `contains` edge is retired so the scaffold does not accumulate orphans. The `ModuleResolver` seam lets task-27.1.3 swap in directory rollups / clustering without touching the writer.

- **Drift surface (`packages/drift`, AC#4/#5).** `drift.resolve` gains a `reanchor` resolution (committing a staged relocation via `reanchor_node`) alongside the existing bin `reattach`/`delete`. The SessionStart banner reports the outstanding drift **count** and each drifted node as a punch-list item, read from the store (the prior git-working-tree banner is removed). Derived scaffold rows (`origin: 'module-scaffold'`) are excluded from the re-attachment bin.

- **UI adapter, registry, edge styling, layout, provenance (`packages/ui`, AC#6/#7/#8).** `custom_graph_to_react_flow` renders leaf nodes from `render(layers)` rows (projected by core's `graph_to_rows`), mapping `attributes.description` to the label and the `agentic.contains` tier to React Flow `parentId`; the closed 2-key `zoom_aware_node_types` becomes an **open kind→component registry** (`register_node_kind`/`build_node_types`); edge styling reads an **open attribute set** (`confidence` + `extractor` + `kind` + `label`/`role`) through one `edge_style_for` path. `apply_hierarchical_layout` accepts an optional fixed-id set — pinned nodes hold their position in both the ELK and fallback paths — with this slice's caller passing an empty set (behaviour unchanged; the seam exists for task-27.2). A selection-driven `ProvenancePanel` reads the selected node's/edge's row off `onSelectionChange`; `navigate_to_file` stays a secondary action.

**What is live vs. seam-complete.** The data-flow milestone — preservation fix → `re_extract` → staged relocation → `drift.resolve {reanchor}` → re-render — is wired and verified end to end at the store/handler level (the `packages/drift` `drift_tool` test drives the full chain on an in-memory store; the `packages/core` `re_extract` test covers staging, no-false-positives, scaffold, orphan retirement, and the accepted re-anchor). Three seams are **built and unit-tested but not yet wired into the running application**, because their live wiring belongs to tasks this slice depends on or feeds:

- **AC#2 production caller.** `re_extract` is the single funnel; the Stop-hook → drift-sync path that calls it headlessly needs the Ariadne extractor injection, which task-27.1.1 already scoped to **task-27.1.6** (drift-sync ships as a documented stub). The SKILL names `re_extract` as the funnel.
- **AC#6 live render path.** The adapter is the leaf-rendering path forward; `code_chart_area` switches onto it once the backend feeds the webview `render(layers)` rows, which is **task-27.1.3**'s "render a flow" work. Until then the live UI runs the existing `CallableNode` pipeline (left in place — no shim).
- **AC#8 live provenance.** The panel and selection wiring are in `code_chart_area`; they populate once the adapter (AC#6) feeds nodes carrying `data.row`.

The open registry, open edge-styling path, and the layout fixed-id seam are wired live now.

**How to navigate.** `packages/core/src/reextract/` is the re-extraction funnel: `re_extract.ts` (entry point + staging), `reanchor.ts` (the commit write), `drift_observation.ts` (the `drift_*` staging keys + the read-only `outstanding_drift` query). `packages/core/src/model/module_scaffold.ts` is the file-module tier. `packages/drift/src/mcp/drift_tool.ts` adds the `reanchor` resolution; the banner is in `packages/drift/src/hooks/session_start_banner.ts`. The UI adapter, registry, edge styling, layout seam, and provenance panel are under `packages/ui/src/components/code_chart_area/`.
