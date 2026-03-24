---
id: TASK-18
title: Polish React Flow performance and type safety
status: In Progress
assignee: []
created_date: '2026-03-23 13:49'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After correctness (task-16) and robustness (task-17) fixes, the remaining issues are performance optimizations that don't work as intended and type safety gaps. React.memo custom comparators are bypassed by internal useStore subscriptions. The LayoutCache is FIFO not LRU and includes positions in cache keys making it effectively single-use. PerformanceMonitor accumulates metrics without bound. NodeProps generics are not parameterized requiring unsafe type casts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] ZoomAwareNode and ModuleGroupNode memo comparators are effective: either lift zoom subscription out and pass as prop, or use a derived boolean selector (zoom < threshold) to minimize re-renders to threshold-crossing changes only
- [x] LayoutCache implements true LRU: get() promotes accessed entries to most-recent position
- [x] Layout cache key excludes node positions (which are the output of layout) and uses only node IDs, dimensions, edges, and parentId relationships
- [x] PerformanceMonitor.metrics array is capped (e.g. 100 entries) with old entry eviction, matching ErrorLogger's pattern
- [x] NodeProps is parameterized with proper generics (e.g. NodeProps<Node<CodeNodeData, 'code_function'>>) eliminating unsafe as-casts
- [x] CSS border/borderWidth conflict in CodeFunctionNode resolved (single source of truth for border width)
- [x] Unused ReactFlowState interface removed from react_flow_types.ts
- [x] Hardcoded colors in get_quality_color and SkipToGraph replaced with theme-sourced values
<!-- AC:END -->

## Implementation Plan

1. AC#1: Replace raw zoom selectors with boolean selector in ZoomAwareNode/ModuleGroupNode
2. AC#2-3: Fix LayoutCache with true LRU get() promotion and position-free cache keys
3. AC#4: Already done (PerformanceMonitor deleted in task-19)
4. AC#5: Parameterize NodeProps generics, remove unsafe as-casts
5. AC#6: Use CONFIG border widths in CodeFunctionNode and use_chart_theme_styles
6. AC#7: Remove unused ReactFlowState from chart_types.ts
7. AC#8: Replace hardcoded colors in get_quality_color and SkipToGraph with theme values
8. Update all affected tests
9. Run lint and tests

## Implementation Notes

- **AC#1**: Introduced a module-level derived boolean selector `select_is_zoomed_out` shared by both `ZoomAwareNode` and `ModuleGroupNode`. Since `Object.is(true, true)` is `true`, useStore only triggers re-renders when the boolean flips at the threshold crossing, making the React.memo comparators effective. Updated accessibility test mocks to execute selectors against mock state.
- **AC#2-3**: `LayoutCache.get()` now promotes via delete+reinsert. `generateKey()` uses `id:width:height:parentId` instead of positions. Fixed `set()` to handle existing keys before eviction. Fixed `|| null` to `=== undefined` for correct falsy-value handling. Added 4 new test cases.
- **AC#4**: PerformanceMonitor was deleted in task-19 as YAGNI. No action needed.
- **AC#5**: Parameterized `NodeProps` with `CodeFunctionNodeType` and `ModuleGroupNodeType` (defined in `chart_types.ts`). Removed all `as CodeNodeData` / `as ModuleNodeData` casts from production code. Type guards in `chart_types.ts` now narrow to discriminated types. Created separate typed test helpers (`create_code_node_props`, `create_module_node_props`).
- **AC#6**: CodeFunctionNode and `getNodeStyle()` in `use_chart_theme_styles.ts` now use `CONFIG.node.visual.borderWidth.selected/default` instead of hardcoded values.
- **AC#7**: Removed the unused custom `ReactFlowState` interface from `chart_types.ts`. All usages import from `@xyflow/react`.
- **AC#8**: `get_quality_color` accepts `ThemeColorConfig` and returns `colors.ui.success/warning/error.text`. `SkipToGraph` uses `useFlowThemeStyles()` for panel background, border, and text colors.

### Modified files
- `chart_node_types.tsx` — boolean selector, NodeProps generics, theme-sourced quality colors
- `code_function_node.tsx` — NodeProps generics, CONFIG border widths
- `chart_types.ts` — discriminated node types, removed unused ReactFlowState
- `layout_cache.ts` — true LRU, position-free keys, set() fix
- `layout_cache.test.ts` — LRU promotion test, position/parentId/dimension tests
- `graph_layout.ts` — removed redundant casts (type guards suffice)
- `keyboard_navigation.tsx` — theme-sourced colors in SkipToGraph
- `use_chart_theme_styles.ts` — CONFIG border widths
- `accessibility.test.tsx` — typed helpers, selector-aware useStore mock
