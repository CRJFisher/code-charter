---
id: TASK-22
title: Persist node positions across chart reloads
status: To Do
assignee: []
created_date: "2026-05-20 13:49"
updated_date: "2026-05-22 11:16"
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

When a user drags a node in a chart, the position is saved and restored the next time the chart loads. Both function nodes and module-group (cluster) nodes are draggable. All position overrides for a chart are gated together by a single graph content hash captured at save time: when the hash matches on load, every override applies; when it does not match, the override map is discarded as a unit and the chart falls back to fresh auto-layout. Non-position customization layers can be added later as sibling files in the same chart directory.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Dragging a function node or a module-group node updates its persisted position
- [ ] #2 Reloading the chart restores all node positions when the chart's stored graph content hash matches the current graph
- [ ] #3 When the stored graph content hash does not match, every position override for the chart is discarded together and the chart falls back to fresh auto-layout
- [ ] #4 Switching between entry-point charts does not clobber any chart's positions
- [ ] #5 A user-visible action clears all position overrides for the current chart
- [ ] #6 Position data from prior chart-persistence formats does not influence the chart after first load
- [ ] #7 Additional customization layers can be stored as sibling files alongside the positions file without changing the existing schema
<!-- AC:END -->
