---
id: TASK-22.5
title: >-
  Wire CodeChartArea to backend for position persistence and disable
  module-group drag
status: To Do
assignee: []
created_date: "2026-05-20 13:50"
labels: []
dependencies:
  - TASK-22.3
  - TASK-22.4
parent_task_id: TASK-22
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The React chart component calls the backend to load and save positions. Saved function-node positions are visible on the chart's first render with no reflow. Releasing a dragged node persists its new position. Module-group nodes are non-draggable so no position is persisted under an unstable cluster identity. The chart toolbar exposes no manual save, export, or clear actions.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Saved function-node positions are visible on the chart's first user-visible render with no reflow
- [ ] #2 Releasing a dragged function node persists its new position via the backend
- [ ] #3 A user's final position after dragging is always the position that is persisted
- [ ] #4 Position overrides whose serialized FunctionNodeKey does not match any node in the regenerated graph have no visible effect
- [ ] #5 Module-group nodes are not draggable
- [ ] #6 The cursor does not change to a grab handle over module-group nodes
- [ ] #7 The chart component does not access browser storage directly
- [ ] #8 The chart toolbar exposes no manual save, export, or clear actions
<!-- AC:END -->
