---
id: TASK-27.1.2
title: "First-milestone vertical slice: leaf rename drift and the preservation fix"
status: To Do
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

The earliest end-to-end vertical slice of task-27.1, delivering `doc-5`'s **first milestone**: rename a script/function in the code, and on session open the diagram flags exactly one drifted node; accept it, and the hand-written description carries across to the renamed symbol intact.

This slice is **leaf-only** — it touches a single code symbol, never a flow or the deferred clustering/zoom hierarchy — so it can land before the flow entity (task-27.1.3) and the agentic detector. Its real value is validating the **seam contracts** the rest of task-27.1 and all of task-27.2 build on, end to end on real plumbing: the persisted store + the anchor resolver + the named re-extraction funnel + the `drift.resolve` MCP write + a host hook + the `CustomGraph`→React Flow adapter + position-preserving layout + selection-driven provenance. The adapter is built to render **one bounded subgraph** — which task-27.1.3 generalizes to "render a flow" — not a slice of a whole-repo map.

It also lands the **preservation-boundary fix** — the one hard data-loss bug inherited from the task-27.0.2 review — because the fix is a prerequisite for any agentic rebuild (task-27.1.4) and the milestone itself exercises a preserved description surviving re-extraction.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 **Preservation fix:** `write_fields` promotes the row's structural `layer` to `user` whenever it stamps a field `user`-owned, so the row vacates the rebuild-eligible layer. A user-owned field on a `layer='agentic'` node survives a `rebuild_layer('agentic')` whose writer does not re-emit that node's id (test: write node at `layer='agentic'`, `write_fields` `as_tier='user'` on its `description`, rebuild without re-emitting, assert node + description still present). The task-27.0.1 `write_fields` contract docstring is updated; task-27.0.4 `render()` still composes correctly with the node at `layer='user'`
- [ ] #2 **Single re-extraction entry point:** re-extraction of a file set is reachable through exactly one named in-process function `re_extract(file_set, origin)`; the host `FileChanged`/`Stop` hooks and the consistency engine are its only callers, each passing `origin='code-change'`; the signature is open to further `origin` values (task-27.2's `origin='apply'`) with no signature change
- [ ] #3 On a leaf code-symbol rename, the resolver (task-27.0.3) reports `relocated`; session open surfaces **exactly one** drifted node for it (no false positives on unrelated symbols)
- [ ] #4 Accepting via `drift.resolve` re-anchors the preserved hand-written `description` onto the renamed symbol **untouched**, and the re-render shows it on the new symbol
- [ ] #5 A `SessionStart` banner reports the outstanding drift count and the drifted node as a punch-list item
- [ ] #6 The `CustomGraph`→React Flow adapter renders leaf nodes from `render(layers)` output, mapping `attributes.description` to the node label; soft-deleted rows excluded unless `show_tombstones`. The adapter resolves the React Flow node `type` from `NodeRow.kind` via an **open registry** (kind→component map), not a hardcoded `code_function`/`module_group` branch (today `zoom_aware_node_types` is a closed 2-key object), so shaped flowchart nodes (task-27.1.11) and doc nodes (task-21.2) are registry entries, not adapter edits. Edge styling maps an **open attribute set** (`confidence` + `extractor` + `kind` + `label`/`role`) to style through one path, so a later semantic edge label (task-27.1.11) or cross-modal tint reads through the same function, not a per-edge-class fork
- [ ] #7 `apply_hierarchical_layout` accepts an optional set of fixed node ids; for those ids it emits fixed-position ELK `layoutOptions` and skips the position overwrite; this slice's caller passes an empty set (so behaviour is unchanged here, but the seam exists for task-27.2)
- [ ] #8 Provenance click-through is driven off React Flow's `onSelectionChange`/`selected`, not by overloading the per-node `navigate_to_file` `onClick`; `navigate_to_file` remains available as a secondary action
- [ ] #9 **File-module first-parent tier:** leaf nodes are grouped under one `agentic.group` per defining file, derived deterministically from each leaf's anchor (`symbol_path` before `#`), persisted with `agentic.contains` edges (leaf→module) and a path-based group id (no anchor-set hash, no clustering); files resolving outside the analyzed root bucket under a single `<external>` group. The adapter (AC#6) renders this one real parent tier above the leaves

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

<!-- Added when work begins. -->
