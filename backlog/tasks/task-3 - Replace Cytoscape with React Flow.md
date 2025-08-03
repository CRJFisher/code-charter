# task-3 - Replace Cytoscape visualisation library with React Flow

## N.B

- this task should be done after ../backlog/tasks/task-6-Extract-web-component-into-standalone-@code-charter-ui-package.md is complete.
- (as a sub-task and extension of existing functionality, we also want to render code flow charts - this might involve some changes to @ariadne/core in order to detect control flow)

## Description (the why)

The current front-end graph visualisation is implemented with **Cytoscape.js**.  
The research summary in `backlog/docs/visualisation-library-research.md` highlights several limitations of Cytoscape for our use-case (custom nodes, developer experience) and recommends **React Flow** as the best fit moving forward.

Replacing Cytoscape with React Flow will

- unlock first-class React component nodes (clickable file/line links, rich tooltips),
- streamline developer workflow by staying within the React paradigm, and
- get around Cytoscape’s limited custom node API and interactivity

## Acceptance Criteria (the what)

- [x] All existing graph views (code tree, call/coupling graph, etc.) are rendered with React Flow instead of Cytoscape.
- [x] Interactive behaviours available today (pan/zoom, select, highlight, focus on node, edge hovering) work identically or better.
- [x] Custom React components can be used as nodes and are demonstrated in at least one view (e.g. node shows file path + "open in IDE" link).
- [x] No runtime dependency on `cytoscape`, `react-cytoscapejs`, or any Cytoscape plugin remains in the codebase.
- [x] All new dependencies (`react-flow`, `@react-flow/core`, etc.) are MIT-licensed and listed in `package.json`.
- [ ] Unit / component tests are updated or added to cover the new React Flow implementation.
- [x] Documentation in `backlog/docs/` is updated: migration rationale, API snippets, and examples.

## Implementation Plan (the how)

1. Document all existing Cytoscape functionality in the UI package
2. Research React Flow capabilities for each feature
3. Create implementation plan for React Flow migration
4. Break down into sub-tasks for each feature

## Implementation Notes

Created comprehensive documentation of existing Cytoscape functionality and React Flow implementation patterns. Generated 10 sub-tasks covering all aspects of the migration:

- Basic setup and component structure (task-3.1)
- Custom node components (task-3.2)
- Layout engine integration (task-3.3)
- Zoom-based visibility (task-3.4)
- Click navigation (task-3.5)
- Module grouping (task-3.6)
- State persistence (task-3.7)
- Data transformation (task-3.8)
- Loading states (task-3.9)
- Cleanup (task-3.10)

Key documents created:

- `backlog/docs/cytoscape-functionality-documentation.md` - Comprehensive documentation of all existing Cytoscape features
- `backlog/docs/react-flow-implementation-guide.md` - Detailed guide on how to implement each feature in React Flow

The migration is now broken down into manageable sub-tasks that can be implemented independently.

## Implementation Notes

Successfully migrated from Cytoscape.js to React Flow through 10 sub-tasks:

**Key achievements:**
- Created new React Flow component alongside existing Cytoscape component for safe migration
- Implemented custom CodeFunctionNode component with click-to-navigate functionality
- Integrated ELK.js for hierarchical layout algorithm
- Added zoom-based visibility control (threshold 0.45) with different views for modules vs functions
- Created comprehensive loading states with animated indicators
- Added state persistence with localStorage and export functionality
- Successfully removed all Cytoscape dependencies and files

**Technical decisions:**
- Used ELK.js instead of React Flow's built-in layout for better hierarchical positioning
- Implemented zoom-aware nodes that switch between detailed and simplified views
- Created module clustering visualization for high-level overview
- Added comprehensive error handling and loading states
- State persistence includes 24-hour expiry and entry point validation

**Files created:**
- code_chart_area_react_flow.tsx - Main React Flow component
- code_function_node.tsx - Custom node component
- zoom_aware_node.tsx - Zoom-aware node wrapper
- elk_layout.ts - ELK.js integration
- react_flow_data_transform.ts - Data transformation from Cytoscape format
- state_persistence.ts - Save/load functionality
- loading_indicator.tsx - Loading UI component
- navigation_utils.ts - VS Code navigation helper

**Files removed:**
- code_chart_area.tsx (old Cytoscape component)
- code_chart_area_simple.tsx (placeholder component)
- cytoscapeStyles.ts
- node_placement.ts

The migration is complete except for unit tests, which should be added as a follow-up task.
