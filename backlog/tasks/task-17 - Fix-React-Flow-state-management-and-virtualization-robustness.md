---
id: TASK-17
title: Fix React Flow state management and virtualization robustness
status: Done
assignee:
  - '@claude'
created_date: '2026-03-23 13:49'
updated_date: '2026-03-23 22:39'
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

<!-- SECTION:PLAN:BEGIN -->
1. Fix ErrorBoundary render condition (remove errorInfo requirement from render check)
2. Fix graph_layout test nodes (add missing `type: "code_function"`, clear dimension cache between tests)
3. Fix edge animated contradiction (remove `animated` from both defaultEdgeOptions and individual edges)
4. Remove invalid `canvas.a11yDescription` key from ariaLabelConfig
5. Simplify triple virtualization: remove `useZoomCulling` entirely, remove `onlyRenderVisibleElements` prop, clean up zoom.culling config
6. Fix keyboard_navigation.tsx: convert setNodes calls to functional updaters
7. Fix code_chart_area.tsx stale closures: onNodeNavigate uses reactFlowInstance.getNode(), handleSaveState/handleExportState use instance.getNodes()/getEdges()
8. Fix search_panel.tsx: move fuzzyMatch to module scope, replace useStore with getNodes/getNode from useReactFlow, use functional setNodes
9. Fix search_panel.test.tsx: restructure mocks from useStore to getNodes/getNode, fix test data and assertions
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All 9 acceptance criteria completed. Removed viewport-unaware useZoomCulling, fixed dual setNodes conflicts with functional updaters, eliminated stale closures via imperative getNodes/getNode/getEdges, resolved edge animation contradiction, removed invalid a11y key, fixed ErrorBoundary lifecycle race. All 137 tests pass, 0 type errors.
<!-- SECTION:NOTES:END -->
