---
id: TASK-22.5
title: Wire CodeChartArea to backend for position persistence
status: To Do
assignee: []
created_date: "2026-05-20 13:50"
updated_date: "2026-05-22 12:03"
labels: []
dependencies:
  - TASK-22.1
  - TASK-22.2
  - TASK-22.3
  - TASK-22.4
parent_task_id: TASK-22
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The React chart component calls the backend to load and save positions. When the chart's stored graph_content_hash matches the current graph, saved positions for both function nodes and module-group nodes are visible on the first render with no reflow. When the hash does not match, all overrides are discarded and the chart falls back to fresh auto-layout. Releasing a dragged node persists its new position; on save the component captures the current graph_content_hash alongside the override map.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Saved positions for function nodes and module-group nodes are visible on the chart's first user-visible render with no reflow when the stored graph_content_hash matches the current graph
- [ ] #2 When the stored graph_content_hash does not match, no position overrides are applied and the chart renders with fresh auto-layout
- [ ] #3 Releasing a dragged function node or module-group node persists its new position via the backend
- [ ] #4 A user's final position after dragging is always the position that is persisted
- [ ] #5 Module-group nodes are draggable and present the same cursor affordance as function nodes
- [ ] #6 Dragging a module-group node moves the group as a unit without altering the relative positions of its member function nodes
- [ ] #7 The chart component does not access browser storage directly
- [ ] #8 The chart toolbar exposes no manual save, export, or clear actions
<!-- AC:END -->
