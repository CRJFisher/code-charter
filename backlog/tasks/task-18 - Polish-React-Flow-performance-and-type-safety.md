---
id: TASK-18
title: Polish React Flow performance and type safety
status: To Do
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
- [ ] ZoomAwareNode and ModuleGroupNode memo comparators are effective: either lift zoom subscription out and pass as prop, or use a derived boolean selector (zoom < threshold) to minimize re-renders to threshold-crossing changes only
- [ ] LayoutCache implements true LRU: get() promotes accessed entries to most-recent position
- [ ] Layout cache key excludes node positions (which are the output of layout) and uses only node IDs, dimensions, edges, and parentId relationships
- [ ] PerformanceMonitor.metrics array is capped (e.g. 100 entries) with old entry eviction, matching ErrorLogger's pattern
- [ ] NodeProps is parameterized with proper generics (e.g. NodeProps<Node<CodeNodeData, 'code_function'>>) eliminating unsafe as-casts
- [ ] CSS border/borderWidth conflict in CodeFunctionNode resolved (single source of truth for border width)
- [ ] Unused ReactFlowState interface removed from react_flow_types.ts
- [ ] Hardcoded colors in get_quality_color and SkipToGraph replaced with theme-sourced values
<!-- AC:END -->
