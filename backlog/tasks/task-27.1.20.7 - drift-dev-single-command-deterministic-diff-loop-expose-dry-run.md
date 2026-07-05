---
id: TASK-27.1.20.7
title: "drift:dev single-command deterministic diff loop + expose --dry-run"
status: To Do
assignee: []
created_date: "2026-07-05 13:51"
labels:
  - drift
  - tooling
  - dx
dependencies:
  - TASK-27.1.20.3
  - TASK-27.1.20.4
parent_task_id: TASK-27.1.20
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[Edit->observe loop spans 3 process contexts with no single-command deterministic path] Iterating on reconcile logic requires rebuild + a full Claude session in the target repo (or hand-reconstructed bin args) + manual sqlite3, even for purely deterministic changes that need no agent at all — minutes-long, error-prone iteration for what should be seconds. dry_run_store + --dry-run already exist as the perfect preview primitive but are unreachable except by manual bin invocation and documented nowhere.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 npm run drift:dev -- --repo <path> --files <changed>: runs the deterministic reconcile against a scratch copy of the store and prints a before/after diff of flows/descriptions/bridges, no Claude session, no token spend
- [ ] #2 Expose --dry-run as a documented drift:dryrun wrapper
- [ ] #3 Add a dev-mode Preview Drift Reconcile command printing would-be outcomes to the OutputChannel

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Reuses the drift-inspect (.4) summary/diff rendering and the run-log format (.3). Preview command surfaces via the OutputChannel from .5.
<!-- SECTION:NOTES:END -->
