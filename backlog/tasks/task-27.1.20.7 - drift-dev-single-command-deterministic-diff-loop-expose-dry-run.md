---
id: TASK-27.1.20.7
title: "drift:dev single-command deterministic diff loop + expose --dry-run"
status: Done
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

- [x] #1 npm run drift:dev -- --repo <path> --files <changed>: runs the deterministic reconcile against a scratch copy of the store and prints a before/after diff of flows/descriptions/bridges, no Claude session, no token spend
- [x] #2 Expose --dry-run as a documented drift:dryrun wrapper
- [x] #3 Add a dev-mode Preview Drift Reconcile command printing would-be outcomes to the OutputChannel

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

The edit→observe loop for a deterministic reconcile change now collapses to one command. Three
reach-throughs to the existing `--dry-run` primitive and the deterministic reconcile engine make a
purely-deterministic iteration provable in seconds, with no Claude session and no token spend:

- **`drift:dev`** (`drift-dev` bin) is the scratch-copy before/after loop. It copies the target
  repo's graph store (and its WAL sidecars) to a throwaway temp dir, runs the real deterministic
  `reconcile()` against the copy, and prints a before/after diff of flows, descriptions, and bridges
  built from the `.4` inspect summary. Because it mutates only the copy, it takes no reconcile lock
  and the real store is never touched — the killer feature over `--dry-run` is that the diff shows
  the *resulting state* (added / retired / re-synced flows, member and bridge deltas), not just an
  action list.
- **`drift:dryrun`** exposes the pre-existing `drift-reconcile --dry-run` as a documented npm
  wrapper: same detection against the real store read-only (write-swallowed via `dry_run_store`),
  reporting the would-be outcomes without a scratch copy.
- The **Code Charter: Preview Drift Reconcile (dev)** command (dev-mode gated, both by the palette
  `when` clause on a context key and a runtime guard) collects the workspace's current diff (tracked
  edits + untracked files vs `HEAD`) and shells `drift-reconcile --dry-run --json` over it, rendering
  the would-be outcomes to the `.5` "Code Charter" OutputChannel.

### How the acceptance criteria are met

- **#1** — `drift-dev` (`src/bin/drift_dev.ts`) parses `--repo` / `--files` (plus optional
  `--store` / `--goal` / `--json`); `stage_scratch_store` copies the store, `reconcile_scratch` runs
  the deterministic default mode only (no agentic stitch/describe, so no tokens), and the new pure
  `src/inspect/diff.ts` + `render_summary_diff` render the before/after over all three surfaces.
  Proven by `src/bin/drift_dev.test.ts` (cold repo all-added without creating the real store, warm
  no-op, rename retire+add with the real store byte-identical, `--json` shape) and the pure
  `src/inspect/diff.test.ts` / render tests.
- **#2** — `drift:dryrun` npm script wraps `drift-reconcile --dry-run`, documented in the drift
  README; the `--dry-run` path itself is covered by `drift_reconcile.test.ts`.
- **#3** — `previewDriftReconcile` command + `format_preview_outcomes` (vscode-agnostic, unit-tested
  in `drift_status.test.ts`); the command wiring shells the bin and renders to the OutputChannel.

### Notable decisions

- The scratch-copy approach (not `--dry-run`) is what AC#1 requires: a before/after *state* diff
  needs the mutated after-state, which `--dry-run`'s write-swallowing cannot produce.
- `read_inspect_input` was extracted from `drift-inspect` so both bins gather a `StoreSummary`
  identically — the diff compares like with like. The HeadlessProject/adapter/deps setup is
  intentionally left duplicated between `drift-dev` and `drift-reconcile` (only two consumers; Rule
  of Three unmet, and the two call sites differ in lock/dry-run handling).
- The diff's change-detection and its renderer share one predicate (`symbol_lists_differ`, set-based)
  so a flow flagged as changed always renders a non-empty reason, and a same-count member/seed
  re-anchor is surfaced rather than read as a false no-op.

Reuses the drift-inspect (.4) summary/diff rendering and the run-log format (.3). Preview command surfaces via the OutputChannel from .5.
<!-- SECTION:NOTES:END -->
