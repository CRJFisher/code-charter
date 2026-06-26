---
id: TASK-29.4
title: Filter non-top-level (closure/anonymous) entrypoints from flows
status: To Do
assignee: []
created_date: "2026-06-24 14:51"
labels:
  - ui
  - bug
dependencies: []
parent_task_id: TASK-29
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Nested closures and anonymous functions surface as call-graph `entry_points` and become flows in the selector, producing noisy and duplicate-looking entries.

Observed in the `~/workspace/bergamot` test repo: several `const embed: EmbedFn = async (...) => {...}` closures — each nested inside a factory (`create_fake_embed`, `create_deterministic_embed`, `scripted_embed`) — and an `<anonymous>` test callback are all classified as `entry_points` by Ariadne, because nothing calls them by name (they are assigned to a const and passed around as callbacks). They then each become their own flow.

Two factors compound the noise:

1. **Ariadne classifies nested closures and anonymous functions as entrypoints.** They have no resolved callers, so the "no incoming call edge" heuristic flags them. The graph also surfaces many `<anonymous>` and `constructor` entrypoints from coverage reports and test scaffolding.
2. **`flow_id_of` (`packages/core/src/model/flow.ts:81`) hardcodes `enclosing=[]`** on the assumption "entrypoints are top-level." For a nested closure that is false, so the real enclosing scope (`create_fake_embed.embed`) is stripped to `embed`. Two closures in the same file collapse to one id; across files they stay distinct but render as several bare `embed` rows.

This is likely an Ariadne entrypoint-classification artifact. It may be resolved when `@ariadnejs/core` is version-bumped (currently `^0.8.0`), so re-evaluate against the live graph after the bump BEFORE adding any filter.

NOT this task: the empty-test-flow filter mismatch and the grouped-member duplicate-row suppression are already fixed in the extension/core flow layer. This task is only the residual closures/anonymous-as-entrypoints noise.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 After the next `@ariadnejs/core` version bump, rebuild the bergamot call graph and record whether nested closures (e.g. the `embed` closures in `tdt/src/fakes/index.ts`, `tdt/src/page_vectors.test.ts`) and anonymous functions are still reported in `graph.entry_points`
- [ ] #2 If the bump resolves it (closures/anonymous no longer entrypoints), close this task with the evidence — no code change
- [ ] #3 If they persist, filter non-top-level entrypoints (those with a non-empty enclosing scope) and/or anonymous functions out of `build_skeleton_flows` and `find_orphan_entrypoints` so they are not surfaced as flows
- [ ] #4 If filtering is needed, decide whether `flow_id_of` should also carry the real enclosing chain (so any legitimately-nested entrypoint keeps a distinct, correct id) rather than the hardcoded `enclosing=[]`
- [ ] #5 Tests cover the chosen behaviour; full core + ui suites pass

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Key code locations:

- `packages/core/src/model/flow.ts:81` — `flow_id_of` hardcodes `enclosing=[]` ("Entrypoints are top-level, so enclosing is []"). This assumption is what this task revisits.
- `packages/core/src/model/flow.ts:119` — `build_skeleton_flows` iterates `graph.entry_points` directly; a filter would live here.
- `packages/core/src/agentic/gap_detection.ts:53` — `find_orphan_entrypoints` already skips `node.is_test` when `include_tests` is false; a non-top-level / anonymous filter would mirror that.

Check whether Ariadne's `CallableNode` exposes the enclosing scope (the symbol_id encodes position but the diagnosis found no enclosing-name field on the node) — qualifying ids by enclosing requires that data, which is another reason to wait for the version bump.

<!-- SECTION:NOTES:END -->
