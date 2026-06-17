---
id: TASK-28
title: Restore module expand/contract, entry-point, and color regressions from 27.1.3 adapter port
status: To Do
assignee: []
created_date: "2026-06-17"
labels: [ui, bug]
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When `feat(27.1.3)` replaced the old `call_tree_to_graph.ts` rendering pipeline with `custom_graph_to_react_flow.ts`, four properties that were set on React Flow nodes in the old adapter were not ported to `build_node()`. The omissions silently broke:

1. **Module expand/contract on drag** — the shrink-fit system (`parent_resize.ts`) requires `expandParent: true` on child nodes so React Flow auto-grows the parent when a child is dragged to the edge, giving the `onNodeDragStop` handler something to shrink back. Without `expandParent`, the module is fixed-size after ELK layout and the parent_resize path never fires.

2. **Child extent guard** — the old adapter used a coordinate-array extent (`[[-1e9, headerHeight], [1e9, 1e9]]`) so children cannot be dragged into the module header zone. The new adapter uses `extent: "parent"`, which allows children to overlap the header.

3. **Entry-point visual distinction** — `is_entry_point` is never set in `build_node()`. The `⮕` arrow, entry-point background color in `CodeFunctionNode`, and entry-point minimap color are all unreachable.

4. **Module color differentiation** — `cluster_index` is hardcoded to `0` for all module group nodes. Every module renders with the same cluster color; they are visually indistinguishable.

Root-cause: `custom_graph_to_react_flow.ts:build_node()` at lines 86–91 (function nodes) and line 72 (module nodes). The `parent_resize.ts` logic and the `onNodeDragStop` wiring in `code_chart_area.tsx` are intact; the adapter just fails to produce the node properties they depend on.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->
- [ ] #1 `build_node()` sets `expandParent: true` on function nodes that have a `parent_id`, so React Flow auto-grows the enclosing module when a child is dragged past its edge
- [ ] #2 `build_node()` uses the coordinate-array form of `extent` (`[[-1e9, CONFIG.layout.module.headerHeight], [1e9, 1e9]]`) instead of `"parent"` for function nodes with a `parent_id`, so children cannot be dragged into the module header
- [ ] #3 After a drag-stop, the parent module shrink-fits its children's bounding box (the existing `onNodeDragStop` → `compute_parent_resize` → `apply_parent_resize` path works end-to-end with the fixed node properties)
- [ ] #4 `build_node()` sets `is_entry_point: true` on the node whose `row.id` matches the flow's entry-point symbol — the `⮕` arrow and entry-point background color render for that node
- [ ] #5 `build_node()` assigns a distinct `cluster_index` to each module group node (derived from its position in the sorted module list) so adjacent modules render with different cluster colors from the palette
- [ ] #6 All existing tests pass; add or update tests in `custom_graph_to_react_flow.test.ts` to cover ACs #1–5
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. **Fix function node properties in `build_node()`** ([custom_graph_to_react_flow.ts:86–91](packages/ui/src/components/code_chart_area/custom_graph_to_react_flow.ts#L86-L91)):
   - Replace `node.extent = "parent"` with `node.extent = [[-1e9, CONFIG.layout.module.headerHeight], [1e9, 1e9]]`
   - Add `node.expandParent = true`

2. **Pass entry-point id into the adapter** — `custom_graph_to_react_flow()` needs to know the flow's entry-point symbol id to set `is_entry_point`. The entry-point node id is already in the rendered rows (it is the flow seed); read it from `rows` (e.g. a `flow_meta` field on `RenderedRows`, or derive it from the node whose `attributes.is_entry_point` is set by the backend) rather than threading a separate argument through the call site if the rows already carry it. If the rows do not carry it, add it as a second argument from the `project_flow` / `render_hydrated_flow` → `render_flow` → `code_chart_area` call chain.

3. **Fix module `cluster_index`** ([custom_graph_to_react_flow.ts:72](packages/ui/src/components/code_chart_area/custom_graph_to_react_flow.ts#L72)):
   - Assign a monotonically increasing index per module node as they are emitted (module nodes are sorted deterministically by group id in `build_module_scaffold`, so the index is stable across re-renders).

4. **Tests** — update/add cases in `custom_graph_to_react_flow.test.ts` asserting:
   - function nodes inside a module have `expandParent: true` and the coordinate-array `extent`
   - the entry-point node has `is_entry_point: true`; non-entry nodes do not
   - module nodes have distinct, sequential `cluster_index` values
<!-- SECTION:PLAN:END -->
