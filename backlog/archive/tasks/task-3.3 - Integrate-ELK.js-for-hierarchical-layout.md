---
id: task-3.3
title: Integrate ELK.js for hierarchical layout
status: Done
assignee: []
created_date: '2025-08-02'
labels: []
dependencies: []
parent_task_id: task-3
---

## Description

Set up ELK.js layout engine to automatically position nodes in a hierarchical structure similar to fcose in Cytoscape

## Acceptance Criteria

- [x] ELK.js is integrated
- [x] Hierarchical layout works for call graphs
- [x] Layout constraints are respected
- [x] Animation between layouts works

## Implementation Plan

1. Install ELK.js dependency
2. Create a layout utility function that converts React Flow nodes/edges to ELK format
3. Configure ELK for hierarchical (layered) layout with downward direction
4. Apply the calculated positions back to React Flow nodes
5. Test with the initial single node
6. Prepare for handling multiple nodes and edges in future tasks

## Implementation Notes

Successfully integrated ELK.js for hierarchical layout of the code call graph. Created elk_layout.ts utility that:
- Converts React Flow nodes/edges to ELK format
- Configures layered algorithm with downward direction
- Calculates node dimensions based on content
- Applies positions back to React Flow nodes
- Supports layout constraints for future use

The layout is configured with:
- Layered algorithm for hierarchical structure
- Downward direction (top to bottom)
- Orthogonal edge routing
- Proper spacing between nodes and layers
- Animation support via React Flow's fitView

Key files created:
- packages/ui/src/components/code_chart_area/elk_layout.ts - ELK layout utility

The implementation is ready to handle multiple nodes and edges when the data transformation logic is migrated in future tasks.
