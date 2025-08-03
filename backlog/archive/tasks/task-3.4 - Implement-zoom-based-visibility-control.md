---
id: task-3.4
title: Implement zoom-based visibility control
status: Done
assignee: []
created_date: '2025-08-02'
labels: []
dependencies: []
parent_task_id: task-3
---

## Description

Add functionality to show/hide details based on zoom level - show modules when zoomed out and individual functions when zoomed in

## Acceptance Criteria

- [x] Zoom level detection works
- [x] Module view shown when zoomed out
- [x] Function view shown when zoomed in
- [x] Smooth transitions between zoom states

## Implementation Plan

1. Add zoom level monitoring using React Flow's useStore hook
2. Define zoom threshold (0.45 to match Cytoscape implementation)
3. Create zoom-aware node component that changes based on zoom level
4. Implement module view (simplified) for zoomed out state
5. Keep detailed function view for zoomed in state
6. Add smooth visual transitions between states

## Implementation Notes

Successfully implemented zoom-based visibility control that matches the Cytoscape behavior:
- Added zoom level monitoring using React Flow's useStore hook
- Set zoom threshold to 0.45 (same as Cytoscape)
- Created ZoomAwareNode component that switches between detailed and simplified views
- Simplified view shows just function name when zoomed out
- Full detail view shows function name and summary when zoomed in
- Added smooth CSS transitions for visual state changes
- Added zoom mode indicator in top-right corner

Key files created/modified:
- packages/ui/src/components/code_chart_area/zoom_aware_node.tsx - Zoom-aware node components
- packages/ui/src/components/code_chart_area/code_chart_area_react_flow.tsx - Added zoom monitoring

The implementation prepares for module clustering by including a ModuleGroupNode component that will be used in task 3.6.
