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

- [ ] All existing graph views (code tree, call/coupling graph, etc.) are rendered with React Flow instead of Cytoscape.
- [ ] Interactive behaviours available today (pan/zoom, select, highlight, focus on node, edge hovering) work identically or better.
- [ ] Custom React components can be used as nodes and are demonstrated in at least one view (e.g. node shows file path + "open in IDE" link).
- [ ] No runtime dependency on `cytoscape`, `react-cytoscapejs`, or any Cytoscape plugin remains in the codebase.
- [ ] All new dependencies (`react-flow`, `@react-flow/core`, etc.) are MIT-licensed and listed in `package.json`.
- [ ] Unit / component tests are updated or added to cover the new React Flow implementation.
- [ ] Documentation in `backlog/docs/` is updated: migration rationale, API snippets, and examples.

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
