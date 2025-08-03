---
id: task-3.2
title: Implement custom CodeFunctionNode component
status: Done
assignee: []
created_date: '2025-08-02'
labels: []
dependencies: []
parent_task_id: task-3
---

## Description

Create a custom React component for rendering function nodes with summaries and styling similar to the current Cytoscape implementation

## Acceptance Criteria

- [x] Custom node component displays function name
- [x] Summary text is shown
- [x] Entry point nodes have special styling
- [x] Handles for edges are properly positioned

## Implementation Plan

1. Create a custom node component file
2. Extract the node styling from cytoscapeStyles.ts
3. Implement the node UI with function name and summary
4. Add special styling for entry point nodes (⮕ prefix)
5. Position connection handles (top for inputs, bottom for outputs)
6. Register the custom node type with React Flow

## Implementation Notes

Created a custom CodeFunctionNode component that renders function nodes with:
- Function name extracted using symbolDisplayName utility
- Summary text with proper wrapping
- Special styling for entry point nodes (green background, arrow prefix)
- Connection handles positioned at top (inputs) and bottom (outputs)

Key files created:
- packages/ui/src/components/code_chart_area/code_function_node.tsx - Custom node component
- packages/ui/src/components/code_chart_area/symbol_utils.ts - Symbol name extraction utility

The component uses inline styles for now to match the Cytoscape styling approach. Entry point nodes have a distinct green background (#e8f5e9) and thicker border, while regular nodes have a white background. The node types are properly registered with React Flow.
