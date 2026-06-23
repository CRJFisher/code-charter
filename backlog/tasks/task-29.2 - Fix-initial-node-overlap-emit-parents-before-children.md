---
id: TASK-29.2
title: Fix initial node overlap (emit parents before children)
status: To Do
assignee: []
created_date: "2026-06-23 02:22"
labels:
  - ui
  - bug
  - confirmed
dependencies: []
parent_task_id: TASK-29
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

CONFIRMED (verified high-confidence, empirically reproduced against the real @xyflow library). On the initial view, every function node renders stacked on top of every other — the elk layout appears not to apply even though it runs and is awaited.

Root cause: node ARRAY ORDER, not layout timing. flow_projection.ts:107 emits nodes: [...leaf_rows, ...scaffold.module_nodes] — children first, parent modules last. The adapter (custom_graph_to_react_flow.ts:45-57) and graph_layout.ts:200 preserve this order. React Flow v12 adoptUserNodes processes the array top-to-bottom; for a child whose parent is not yet in nodeLookup it early-returns WITHOUT deriving the child absolute position, leaving the child at its raw parent-relative coord (~(40,70)). All children across all modules collapse to near-identical coords -> universal overlap. Verifier ran adoptUserNodes directly: children-first order -> two children both resolve to (40,70); parents-first -> distinct (540,370)/(940,370).

Note: this ordering fix ONLY resolves the initial overlap. RF self-heals ordering on the measurement cycle, so it does NOT fix the drag-follow / jump symptoms (.3/.4) despite the first-pass diagnosis claiming so — it merely silences the console warning for those.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 custom_graph_to_react_flow.ts orders the emitted nodes so every parent precedes its children, e.g. return [...nodes.filter(n => !n.parentId), ...nodes.filter(n => n.parentId)] (stable partition; use a depth sort if nesting is ever introduced)
- [ ] #2 New test in custom_graph_to_react_flow.test.ts: for children-first input rows, every node index is greater than its parent index in the adapter output
- [ ] #3 Initial render of a flow with modules shows non-overlapping nodes at their elk-computed positions
- [ ] #4 No 'Parent node not found / parent nodes in front of their child nodes' RF console warning on load
- [ ] #5 All existing tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. In custom_graph_to_react_flow.ts, after building the nodes array (around :43-66), return a parent-before-child partition. Fix at the adapter boundary (it owns the parentId contract), not at flow_projection.
2. Do NOT touch parentId/expandParent/extent/cluster_index/entry-point assignment — order only.
3. Add the index-invariant test.
4. Verify the over-budget path (module-only, no parentId) is unaffected.
<!-- SECTION:PLAN:END -->
