---
id: TASK-27.1.20.5
title: >-
  Code Charter OutputChannel + drift-armed status bar + reveal-on-problem
  install task
status: Done
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

- [x] #1 Create a Code Charter OutputChannel; route the 3 existing console.* sites plus install results and the .3 sync-status record through it
- [x] #2 On activation/generate, verify the Stop hook in the target .claude/settings.json and show a status-bar item: drift armed / drift NOT installed — click to fix
- [x] #3 Change the Install Drift Into Target Repo task presentation from silent to reveal-on-problem in .vscode/tasks.json
- [x] #4 GC the stale watermark files accumulated in .code-charter/ (one cursor file, or drop cursors older than N days)

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

Every intermediate drift failure now leaves a trace. The extension owns a single **"Code Charter" OutputChannel**: the three `extension.ts` `console.*` sites, each install outcome (skipped-because-self / installed / FAILED with the error), and the persisted sync-status health record all write there. On activation (`onStartupFinished`) and on every generate, the extension **verifies the drift Stop hook** in the workspace's `.claude/settings.json` and reflects it in a **status-bar item** — `Drift armed`, or `Drift NOT installed` on a warning background whose click runs the install. When the open workspace is code-charter itself the bar hides, mirroring the install self-skip. The **Install Drift preLaunchTask** reveals its terminal on problem instead of running silent, so a failed install can no longer install nothing invisibly. And the Stop hook **garbage-collects dead per-session watermark cursors** from `.code-charter/` on every fire, so a long-lived repo no longer accretes one cursor file per past session.

The design splits cleanly along the vscode boundary: the drift package gains the testable, host-free primitives (`is_stop_hook_installed`, the pure `select_stale_watermarks` selector), and the extension holds only wiring. A new `packages/vscode/src/drift_status.ts` keeps the vscode-agnostic view logic (`drift_bar_state`, `format_sync_status`) unit-testable without a VS Code mock.

### How each acceptance criterion is met

- **#1 OutputChannel** — `extension.ts` creates the channel in `activate()` and funnels output through a `log()` helper. `ensure_drift_installed` logs skip/success/failure; `refresh_drift_status` renders `read_sync_status()` (the task-27.1.20.3 record) via `format_sync_status`. Proven by `drift_status.test.ts` (all four sync-status states) plus the compile-time channel wiring; a grep confirms the three `extension.ts` `console.*` sites are gone (the remaining `console.*` in `files.ts`/`dev_watcher.ts`/`project_manager.ts` are out of the AC's stated scope).
- **#2 Stop-hook verification + status bar** — drift's `is_stop_hook_installed(target_root, layout)` reads the host settings and recognises the drift Stop group by `STOP_HOOK_IDENTITY_TOKEN` (the same token the installer writes, so verification and install can never disagree); absent/malformed settings read as not-armed. `drift_bar_state` maps that to the bar view; the click routes to the `installDrift` command only when not armed. Proven by `install.test.ts` (armed-after-install / unwritten / foreign-only / malformed), `drift_status.test.ts`, and an end-to-end drive against the compiled dist (false → true after install).
- **#3 reveal-on-problem** — the Install Drift task presentation is `reveal: "silent"` + `revealProblems: "onProblem"`: the terminal stays quiet on a clean install and surfaces on failure, and the failure is independently visible through the new status bar and OutputChannel. (`reveal: "always"` was considered and rejected — it steals terminal focus on every successful F5.)
- **#4 watermark GC** — the pure `select_stale_watermarks(entries, now_ms, max_age_ms)` in `stop_watermark.ts` owns the drop decision (7-day cursor TTL); `gc_stale_watermarks` in the Stop-hook bin runs it once per fire over the store dir, stats each entry defensively so one unreadable sibling cannot abort the prune, and is fully best-effort. Proven by the pure selector's boundary/sibling-safety tests and a bin-level test that plants an 8-day-old cursor, fires the hook, and asserts it is deleted while a fresh cursor and the current fire's cursor survive.

Files: `packages/vscode/src/extension.ts`, `packages/vscode/src/drift_status.ts` (new), `packages/vscode/package.json`, `.vscode/tasks.json`, `packages/drift/src/installer/install.ts` (`is_stop_hook_installed`), `packages/drift/src/hooks/stop_watermark.ts` (GC selector), `packages/drift/src/bin/drift_stop_hook.ts` (GC wiring), `packages/drift/src/index.ts`. Surfaces the sync-status record from task-27.1.20.3.
<!-- SECTION:NOTES:END -->
