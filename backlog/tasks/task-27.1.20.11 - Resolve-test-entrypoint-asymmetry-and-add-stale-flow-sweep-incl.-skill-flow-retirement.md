---
id: TASK-27.1.20.11
title: >-
  Resolve test-entrypoint asymmetry and add stale-flow sweep incl. skill-flow
  retirement
status: Done
assignee: []
created_date: "2026-07-05 13:52"
labels:
  - drift
  - correctness
dependencies:
  - TASK-27.1.20.10
parent_task_id: TASK-27.1.20
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[MEDIUM] build_skeleton_flows hydrates test-file entrypoints as singleton flows, but build_entrypoint_inventory and find_orphan_entrypoints both skip is_test — so test-rooted flows are persisted yet invisible to the agent: un-stitchable and un-retirable clutter. Separately, skill flows appear to have NO retirement path at all — deleting a SKILL.md leaves the flow live.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Test-entrypoint handling is consistent: either test-rooted flows are made visible to the inventory/orphan passes, or they are not hydrated — no persisted-but-invisible clutter
- [x] #2 A stale-flow sweep retires flows whose seeds no longer exist, including a retirement path for skill flows when a SKILL.md is deleted

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

Test entrypoints are invisible to the agent by design — `build_entrypoint_inventory` and `find_orphan_entrypoints` skip `is_test` — yet the hydration path persisted test-rooted flows whenever a test tree touched a changed file, producing clutter the agent could neither stitch nor retire. Separately, nothing could ever retire a skill flow: deleting a SKILL.md removes the very marker `find_skill_root` walks for, so the deletion never partitions into a skill root and no change-scoped pass can see it.

Test-rooted flows are resolved by never persisting them, on every write path: `detect_code_umbrellas` skips skeleton flows seeded on a test entrypoint, the scoped resync excludes test-rooted persisted flows (they fall through to the sweep, which retires them as legacy clutter), and `apply_stitch` rejects agent-invented test seeds. The VS Code selector's session-derived skeleton still lists test flows — browsable, just never persisted. Making tests visible to the agent instead was rejected: it would flood the inventory with entrypoints the stitch machinery deliberately ignores.

Retirement for flows no edit ever implicates lives in `stale_flows.ts`: a turn-final sweep over the persisted flows, inside the turn transaction. It retires a code flow only when every stored seed file is gone from disk — without a corroborating edit, a still-present file whose seed does not resolve is ambiguous (an out-of-band rename, or a partial mid-edit parse) and defers to the change-scoped pass. A skill flow retires when `<skill_root>/SKILL.md` is absent; the repo-relative `skill_root` attribute is stamped on the flow node at hydrate time because doc-node ids carry only the skill's basename. Every disk check classifies errno (only ENOENT/ENOTDIR prove absence; EACCES defers), and an empty call graph gates only the code assessment, so skills-only repos still sweep.

Navigation: `stale_flows.ts` owns the sweep and the shared seed-loss assessment (`assess_code_seed_loss`, mode-split scoped/sweep); `reconcile.ts` wires it as pipeline step 4; `flow_store.ts` owns the id-prefix discriminator (`is_skill_flow_id`) and `stored_skill_root`.

Known edges: a skill flow persisted before `skill_root` existed whose bundle is already deleted stays live (accepted — no back-compat; the sweep logs it every turn), and an out-of-band in-file rename defers until its file is next touched.

<!-- SECTION:NOTES:END -->
