---
id: task-3.5
title: Add click-to-navigate functionality
status: Done
assignee: []
created_date: '2025-08-02'
labels: []
dependencies: []
parent_task_id: task-3
---

## Description

Implement the ability to click on function nodes to open the source file in VS Code at the specific line number

## Acceptance Criteria

- [x] Click handler on nodes works
- [x] VS Code URL scheme implemented
- [x] File opens at correct line
- [x] Click doesn't interfere with node dragging

## Implementation Plan

1. Check existing navigateToDoc function implementation
2. Add click handler to both CodeFunctionNode and ZoomAwareNode
3. Implement VS Code URL scheme navigation
4. Add visual feedback on click (optional)
5. Ensure click events don't trigger during drag operations
6. Test with actual file paths and line numbers

## Implementation Notes

Successfully added click-to-navigate functionality to both full and simplified node views:
- Created navigation_utils.ts with VS Code URL scheme support
- Added click handlers to CodeFunctionNode and ZoomAwareNode
- Implemented hover effects for visual feedback (scale and shadow)
- Configured React Flow with nodesDraggable=false to prevent drag interference
- Used stopPropagation to prevent node selection on click

The navigation supports both VS Code webview context (via postMessage) and standalone browser context (via window.open with vscode:// URL scheme).

Key files created/modified:
- packages/ui/src/components/code_chart_area/navigation_utils.ts - Navigation utility
- packages/ui/src/components/code_chart_area/code_function_node.tsx - Added click handler
- packages/ui/src/components/code_chart_area/zoom_aware_node.tsx - Added click handler for simplified view
