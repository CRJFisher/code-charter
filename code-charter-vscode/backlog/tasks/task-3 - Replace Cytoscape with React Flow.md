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

1. Read the comparative analysis in `backlog/docs/visualisation-library-research.md` to extract React Flow best-practices.
2. Spike a minimal React Flow demo to validate custom node rendering and performance with representative graph size.
3. Introduce React Flow packages and remove Cytoscape dependencies from `package.json`.
4. Refactor the graph visualisation component(s):
   1. Replace graph initialisation with `<ReactFlow>` container.
   2. Map existing data model (nodes, edges, positions, metadata) to React Flow format.
   3. Implement node / edge styles and interactive callbacks (onNodeClick, onEdgeMouseEnter, etc.).
5. Port view-specific behaviours (layout, auto-fit, diff colours) using React Flow utilities or custom code.
6. Update tests: adjust snapshots, re-enable mounting helpers, and add new tests for custom nodes.
7. Update Storybook / example pages if present.
8. Purge leftover Cytoscape code and docs; run linter & type checks.
9. Document migration steps and noteworthy API differences.

## Implementation Notes (to be filled when task is in progress)

_Add details about the chosen approach, trade-offs, and file changes here during implementation._
