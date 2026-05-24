---
id: TASK-22.3
title: Implement MockBackend position storage with legacy localStorage discard
status: To Do
assignee: []
created_date: '2026-05-20 13:50'
updated_date: '2026-05-24 14:10'
labels: []
dependencies:
  - TASK-22.1
  - TASK-22.2
parent_task_id: TASK-22
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The standalone web demo (mock backend) persists positions in the browser's localStorage keyed per chart. Any data under the localStorage key `code-charter-react-flow-state` is discarded on first load.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each chart's positions are isolated under their own localStorage key
- [ ] #2 Saving chart A does not affect chart B
- [ ] #3 A single stored record per chart holds the position overrides for all node types and the chart's graph_content_hash
- [ ] #4 Load returns null when no record exists for a chart_id
- [ ] #5 Storage-quota failures do not throw and saves continue to succeed within the session
- [ ] #6 When localStorage is unavailable, saves and loads still succeed within the session
- [ ] #7 Data under the localStorage key `code-charter-react-flow-state` is removed on first load if present
- [ ] #8 The user is informed once when previously stored chart state has been discarded
- [ ] #9 Automated tests cover save, load, per-chart isolation, deletion, storage-quota failure, and discard of the prior key
<!-- AC:END -->
