---
id: TASK-17
title: Fix React Flow state management and virtualization robustness
status: To Do
assignee: []
created_date: '2026-03-23 13:49'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After fixing the critical correctness bugs in task-16, several robustness issues remain in the React Flow integration. The triple virtualization system has conflicting layers that can hide visible nodes. The dual setNodes pattern (useNodesState vs useReactFlow) creates race conditions during concurrent drag and selection. Multiple stale closures capture outdated node/edge arrays. The animated edge default contradicts individual edge settings. 16 tests are failing across 3 suites.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] Triple virtualization simplified: remove useZoomCulling (viewport-unaware hash sampling) or make it viewport-aware; remove redundant onlyRenderVisibleElements since useVirtualNodes already handles viewport culling
- [ ] Dual setNodes conflict resolved: search_panel.tsx and keyboard_navigation.tsx use functional updates or React Flow's updateNode API instead of replacing the full node array
- [ ] onNodeNavigate callback uses reactFlowInstance.getNodes() instead of closing over stale nodes array
- [ ] handleSaveState uses reactFlowInstance.getNodes()/getEdges() instead of closing over stale state
- [ ] Edge animated property is consistent: either remove animated:true from defaultEdgeOptions or remove animated:false from individual edges
- [ ] Invalid canvas.a11yDescription key removed from ariaLabelConfig
- [ ] SearchPanel uses getNodes() inside callbacks instead of subscribing to state.nodes via useStore (avoiding re-renders on every drag/selection)
- [ ] Debounce timing synchronized: useZoomCulling and visibleNodeIds use the same viewport source (both raw or both debounced)
- [ ] All 16 failing tests in error_handling, elk_layout, and search_panel suites are fixed and passing
<!-- AC:END -->
