---
id: TASK-18
title: Polish React Flow performance and type safety
status: Done
assignee: []
created_date: '2026-03-23 13:49'
updated_date: '2026-05-24 14:09'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After correctness (task-16) and robustness (task-17) fixes, the remaining issues are performance optimizations that don't work as intended and type safety gaps. React.memo custom comparators are bypassed by internal useStore subscriptions. The LayoutCache is FIFO not LRU and includes positions in cache keys making it effectively single-use. PerformanceMonitor accumulates metrics without bound. NodeProps generics are not parameterized requiring unsafe type casts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ZoomAwareNode and ModuleGroupNode memo comparators are effective: either lift zoom subscription out and pass as prop, or use a derived boolean selector (zoom < threshold) to minimize re-renders to threshold-crossing changes only
- [x] #2 LayoutCache implements true LRU: get() promotes accessed entries to most-recent position
- [x] #3 Layout cache key excludes node positions (which are the output of layout) and uses only node IDs, dimensions, edges, and parentId relationships
- [x] #4 PerformanceMonitor.metrics array is capped (e.g. 100 entries) with old entry eviction, matching ErrorLogger's pattern
- [x] #5 NodeProps is parameterized with proper generics (e.g. NodeProps<Node<CodeNodeData, 'code_function'>>) eliminating unsafe as-casts
- [x] #6 CSS border/borderWidth conflict in CodeFunctionNode resolved (single source of truth for border width)
- [x] #7 Unused ReactFlowState interface removed from react_flow_types.ts
- [x] #8 Hardcoded colors in get_quality_color and SkipToGraph replaced with theme-sourced values
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. AC#1: Replace raw zoom selectors with boolean selector in ZoomAwareNode/ModuleGroupNode
2. AC#2-3: Fix LayoutCache with true LRU get() promotion and position-free cache keys
3. AC#4: Already done (PerformanceMonitor deleted in task-19)
4. AC#5: Parameterize NodeProps generics, remove unsafe as-casts
5. AC#6: Use CONFIG border widths in CodeFunctionNode and use_chart_theme_styles
6. AC#7: Remove unused ReactFlowState from chart_types.ts
7. AC#8: Replace hardcoded colors in get_quality_color and SkipToGraph with theme values
8. Update all affected tests
9. Run lint and tests
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All 8 acceptance criteria complete: zoom boolean selector for effective React.memo, true LRU cache with position-free keys, NodeProps generics eliminating as-casts, CONFIG-sourced border widths, ReactFlowState removed, theme-sourced colors in get_quality_color and SkipToGraph. PerformanceMonitor AC obsoleted by task-19 deletion.
<!-- SECTION:NOTES:END -->
