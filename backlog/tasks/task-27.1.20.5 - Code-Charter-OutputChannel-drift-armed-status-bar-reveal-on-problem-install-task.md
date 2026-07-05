---
id: TASK-27.1.20.5
title: >-
  Code Charter OutputChannel + drift-armed status bar + reveal-on-problem
  install task
status: To Do
assignee: []
created_date: "2026-07-05 13:50"
labels:
  - drift
  - vscode
  - dx
dependencies:
  - TASK-27.1.20.3
parent_task_id: TASK-27.1.20
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[Every intermediate failure is silent] The preLaunchTask install is presentation:silent (a build failure means the hook is never installed, invisibly); ensure_drift_installed swallows errors into console.error; drift_stop_hook exits 0 on any error by design; a stale dist means the hook runs old code with no version mismatch signal. "Why did my sync do nothing?" is the most common debug question and currently has no starting point; the developer can iterate a whole session against a disarmed or stale hook. The extension has no OutputChannel (only 3 console.* sites in devtools nobody opens).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Create a Code Charter OutputChannel; route the 3 existing console.* sites plus install results and the .3 sync-status record through it
- [ ] #2 On activation/generate, verify the Stop hook in the target .claude/settings.json and show a status-bar item: drift armed / drift NOT installed — click to fix
- [ ] #3 Change the Install Drift Into Target Repo task presentation from silent to reveal-on-problem in .vscode/tasks.json
- [ ] #4 GC the stale watermark files accumulated in .code-charter/ (one cursor file, or drop cursors older than N days)

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Files: packages/vscode/src/extension.ts, .vscode/tasks.json, packages/drift/src/hooks/stop_watermark.ts (GC). Surfaces the sync-status from .3.
<!-- SECTION:NOTES:END -->
