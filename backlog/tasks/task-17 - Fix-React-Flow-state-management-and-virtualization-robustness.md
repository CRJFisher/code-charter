---
id: TASK-17
title: Fix React Flow state management and virtualization robustness
status: In Progress
assignee:
  - '@claude'
created_date: '2026-03-23 13:49'
updated_date: '2026-03-23 22:15'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After fixing the critical correctness bugs in task-16, several robustness issues remain in the React Flow integration. The triple virtualization system has conflicting layers that can hide visible nodes. The dual setNodes pattern (useNodesState vs useReactFlow) creates race conditions during concurrent drag and selection. Multiple stale closures capture outdated node/edge arrays. The animated edge default contradicts individual edge settings. 16 tests are failing across 3 suites.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Triple virtualization simplified: remove useZoomCulling (viewport-unaware hash sampling) or make it viewport-aware; remove redundant onlyRenderVisibleElements since useVirtualNodes already handles viewport culling
- [x] #2 Dual setNodes conflict resolved: search_panel.tsx and keyboard_navigation.tsx use functional updates or React Flow's updateNode API instead of replacing the full node array
- [x] #3 onNodeNavigate callback uses reactFlowInstance.getNodes() instead of closing over stale nodes array
- [x] #4 handleSaveState uses reactFlowInstance.getNodes()/getEdges() instead of closing over stale state
- [x] #5 Edge animated property is consistent: either remove animated:true from defaultEdgeOptions or remove animated:false from individual edges
- [x] #6 Invalid canvas.a11yDescription key removed from ariaLabelConfig
- [x] #7 SearchPanel uses getNodes() inside callbacks instead of subscribing to state.nodes via useStore (avoiding re-renders on every drag/selection)
- [x] #8 Debounce timing synchronized: useZoomCulling and visibleNodeIds use the same viewport source (both raw or both debounced)
- [x] #9 All 16 failing tests in error_handling, elk_layout, and search_panel suites are fixed and passing
<!-- AC:END -->

## Implementation Plan

1. Fix ErrorBoundary render condition (remove errorInfo requirement from render check)
2. Fix graph_layout test nodes (add missing `type: "code_function"`, clear dimension cache between tests)
3. Fix edge animated contradiction (remove `animated` from both defaultEdgeOptions and individual edges)
4. Remove invalid `canvas.a11yDescription` key from ariaLabelConfig
5. Simplify triple virtualization: remove `useZoomCulling` entirely, remove `onlyRenderVisibleElements` prop, clean up zoom.culling config
6. Fix keyboard_navigation.tsx: convert setNodes calls to functional updaters
7. Fix code_chart_area.tsx stale closures: onNodeNavigate uses reactFlowInstance.getNode(), handleSaveState/handleExportState use instance.getNodes()/getEdges()
8. Fix search_panel.tsx: move fuzzyMatch to module scope, replace useStore with getNodes/getNode from useReactFlow, use functional setNodes
9. Fix search_panel.test.tsx: restructure mocks from useStore to getNodes/getNode, fix test data and assertions

## Implementation Notes

### Approach
Addressed all 9 acceptance criteria in a single pass, fixing production code and tests together.

### Features modified
- **Virtualization pipeline** (virtual_renderer.tsx, code_chart_area.tsx): Removed `useZoomCulling` (viewport-unaware hash-based sampling that could hide visible nodes) and `onlyRenderVisibleElements` (redundant with `useVirtualNodes`). The system now has a single virtualization layer: `getVisibleNodes` + `useVirtualNodes`.
- **State management** (search_panel.tsx, keyboard_navigation.tsx, code_chart_area.tsx): All `setNodes` calls now use functional updaters to avoid replacing stale arrays. All callbacks that need node data now read it imperatively via `getNodes()`/`getNode()`/`getEdges()` instead of closing over snapshot arrays.
- **SearchPanel** (search_panel.tsx): Replaced `useStore` subscription with `getNodes()` from `useReactFlow`, eliminating re-renders on every drag/selection. Moved `fuzzyMatch` to module scope to fix temporal dead zone issue.
- **Edge animation** (call_tree_to_graph.ts, code_chart_area.tsx): Removed contradictory `animated` settings from both `defaultEdgeOptions` and individual edges. React Flow defaults to `animated: false`.
- **ErrorBoundary** (error_boundary.tsx): Fixed render condition that required `errorInfo` before showing fallback UI. `getDerivedStateFromError` fires before `componentDidCatch`, so `errorInfo` is null on the first render after an error.

### Technical decisions
- Chose to remove `useZoomCulling` entirely rather than making it viewport-aware, since `useVirtualNodes` already handles viewport culling correctly. The hash-based 30% sampling was fundamentally flawed.
- Removing `onlyRenderVisibleElements` allows React Flow to render buffer nodes (edge-connected neighbors slightly outside viewport), preventing edge clipping.
- The `searchResults` useMemo depends on `getNodes` (a stable ref), so it only recomputes on query changes. This is intentional -- avoids re-renders on drag/selection.

### Modified files
- `packages/ui/src/components/code_chart_area/virtual_renderer.tsx` - Removed `useZoomCulling`, cleaned up unused imports
- `packages/ui/src/components/code_chart_area/code_chart_area.tsx` - Removed virtualization layers, fixed stale closures, stabilized callbacks
- `packages/ui/src/components/code_chart_area/chart_config.ts` - Removed orphaned `zoom.culling` config
- `packages/ui/src/components/code_chart_area/search_panel.tsx` - Replaced useStore with getNodes, functional setNodes, module-level fuzzyMatch
- `packages/ui/src/components/code_chart_area/keyboard_navigation.tsx` - Functional setNodes updaters
- `packages/ui/src/components/code_chart_area/call_tree_to_graph.ts` - Removed `animated: false` from edges
- `packages/ui/src/error/error_boundary.tsx` - Fixed render condition, added synthetic ErrorInfo fallback
- `packages/ui/src/components/code_chart_area/error_handling.test.tsx` - Fixed ErrorBoundary tests
- `packages/ui/src/components/code_chart_area/graph_layout.test.ts` - Added node types, cache clearing
- `packages/ui/src/components/code_chart_area/search_panel.test.tsx` - Restructured mocks for new API
