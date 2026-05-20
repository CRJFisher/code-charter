---
id: TASK-22
title: Persist function-node positions across chart reloads
status: To Do
assignee: []
created_date: "2026-05-20 13:49"
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

When a user drags a function node in a chart, the position is saved and restored the next time the chart loads. The schema and storage are layer-scoped so additional customization layers can be added as sibling files under each chart directory. Module-group nodes are not draggable; only function-node positions are persisted.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Dragging a function node updates its persisted position
- [ ] #2 Reloading the chart restores positions for nodes whose stable identity is unchanged
- [ ] #3 Switching between entry-point charts does not clobber any chart's positions
- [ ] #4 Module-group nodes are not draggable
- [ ] #5 A user-visible action clears all position overrides for the current chart
- [ ] #6 Position data from prior chart-persistence formats does not influence the chart after first load
- [ ] #7 Additional customization layers can be stored as sibling files alongside the function-node position file without changing the existing schema
<!-- AC:END -->
