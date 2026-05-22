---
id: TASK-22.1
title: Define chart position schema in @code-charter/types
status: To Do
assignee: []
created_date: "2026-05-20 13:49"
updated_date: "2026-05-22 11:56"
labels: []
dependencies: []
parent_task_id: TASK-22
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Establish the canonical ChartPositions document shape shared by both backends and the UI. The document carries a single override map keyed by the React Flow node id used during graph rendering; function nodes and module-group nodes share the same map. A graph_content_hash captured at save time gates the whole override map: a matching hash on load means every override applies; a mismatch means the override map is discarded as a unit and the chart falls back to fresh auto-layout.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A ChartPositions document type captures a schema_version, a chart_id, a revision, a graph_content_hash, and a position_overrides map
- [ ] #2 position_overrides is keyed by the React Flow node id used during graph rendering and each entry carries a 2D coordinate with numeric x and y
- [ ] #3 The new type is part of the public surface of the @code-charter/types package
- [ ] #4 A sample document containing entries for both function nodes and module-group nodes round-trips through JSON.stringify and JSON.parse without loss
- [ ] #5 The schema has no dependency on UI rendering library types
- [ ] #6 schema_version is 1; chart_id is an opaque string supplied by the UI; revision is a monotonic integer used by backends to detect stale writes; graph_content_hash is an opaque string captured from the rendered-graph artifact at save time
<!-- AC:END -->
