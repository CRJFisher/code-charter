---
id: TASK-22.6
title: Reset chart action for clearing stored positions
status: To Do
assignee: []
created_date: "2026-05-20 13:51"
labels: []
dependencies:
  - TASK-22.5
parent_task_id: TASK-22
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

A user-visible action clears all stored position overrides for the current chart, so an accidental off-screen drag is recoverable without filesystem surgery. The action is destructive and must be confirm-gated.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A Reset chart control is reachable from the chart toolbar
- [ ] #2 Activating it clears all stored position overrides for the current chart and re-runs the auto-layout
- [ ] #3 Confirmation is required before clearing
- [ ] #4 After reset the chart renders identically to a never-customized chart
- [ ] #5 The action is keyboard-reachable
- [ ] #6 Assistive technologies announce the reset outcome
<!-- AC:END -->
