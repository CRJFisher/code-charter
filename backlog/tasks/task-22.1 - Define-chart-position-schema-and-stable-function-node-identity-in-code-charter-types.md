---
id: TASK-22.1
title: >-
  Define chart position schema and stable function-node identity in
  @code-charter/types
status: To Do
assignee: []
created_date: "2026-05-20 13:49"
labels: []
dependencies: []
parent_task_id: TASK-22
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Establish the canonical ChartPositions document shape and the FunctionNodeKey composite identity (kind plus file_path_rel plus name), shared by both backends and the UI. Identity must survive line shifts in the source file, since the raw ariadne SymbolId is line-encoded. File and field names are layer-scoped so additional customization layers live in sibling files under each chart directory.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A ChartPositions document type captures a chart_id, a revision marker, and per-node position overrides keyed by the serialized FunctionNodeKey
- [ ] #2 Each position override carries a 2D coordinate with numeric x and y
- [ ] #3 A FunctionNodeKey type and a reversible serialize-and-parse pair are defined
- [ ] #4 The serialized FunctionNodeKey is stable across runs that only touch unrelated source lines in the same file
- [ ] #5 The new types are part of the public surface of the @code-charter/types package
- [ ] #6 A sample document round-trips through JSON.stringify and JSON.parse without loss
- [ ] #7 The schema has no dependency on UI rendering library types
- [ ] #8 schema_version is 1; chart_id is an opaque string supplied by the UI; revision is a monotonic integer used by backends to detect stale writes
<!-- AC:END -->
