---
id: TASK-22.2
title: Add chart-position methods to CodeCharterBackend interface
status: To Do
assignee: []
created_date: "2026-05-20 13:50"
labels: []
dependencies:
  - TASK-22.1
parent_task_id: TASK-22
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The backend abstraction exposes operations to load and save a chart's positions through one contract; every backend implementation honors it. The UI requests load and save only through this contract and never touches storage directly.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 CodeCharterBackend declares load_chart_positions taking a chart_id and returning a Promise resolving to ChartPositions or null
- [ ] #2 CodeCharterBackend declares save_chart_positions taking a chart_id and a ChartPositions document and returning a Promise resolving to void
- [ ] #3 Every backend class compiles with an implementation of both methods
- [ ] #4 Automated tests assert both method signatures are callable on every backend implementation
- [ ] #5 No method signature references UI rendering library types
<!-- AC:END -->
