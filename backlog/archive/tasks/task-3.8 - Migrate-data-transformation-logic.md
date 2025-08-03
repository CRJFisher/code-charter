---
id: task-3.8
title: Migrate data transformation logic
status: Done
assignee: []
created_date: '2025-08-02'
labels: []
dependencies: []
parent_task_id: task-3
---

## Description

Port the node and edge generation logic from Cytoscape format to React Flow format

## Acceptance Criteria

- [x] generateElements function adapted for React Flow
- [x] Node data structure matches React Flow format
- [x] Edge data structure matches React Flow format
- [x] All node metadata is preserved

## Implementation Plan

1. Study the existing generateElements function in node_placement.ts
2. Create a React Flow version that generates nodes and edges
3. Convert Cytoscape node format to React Flow node format
4. Convert Cytoscape edge format to React Flow edge format
5. Preserve all metadata (summaries, file paths, symbols)
6. Handle the full call graph tree, not just the entry point

## Implementation Notes

Successfully migrated the data transformation logic from Cytoscape to React Flow format:
- Created react_flow_data_transform.ts with generateReactFlowElements function
- Converts CallGraphNode tree to React Flow nodes and edges
- Preserves all metadata (symbols, summaries, file paths, line numbers)
- Handles module grouping with parent-child relationships
- Tracks module connections for compound edges
- Recursively processes the entire call tree from entry point

The new data structure:
- Nodes use the custom "code_function" type with CodeNodeData
- Edges use default React Flow edge format
- Module groups prepared for task 3.6 with "module_group" type
- All nodes have calculated dimensions for proper layout

Key files created/modified:
- packages/ui/src/components/code_chart_area/react_flow_data_transform.ts - Data transformation logic
- packages/ui/src/components/code_chart_area/code_chart_area_react_flow.tsx - Updated to use new transformation
