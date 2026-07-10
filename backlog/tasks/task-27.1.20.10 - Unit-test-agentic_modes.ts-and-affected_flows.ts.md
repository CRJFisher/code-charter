---
id: TASK-27.1.20.10
title: Unit-test agentic_modes.ts and affected_flows.ts
status: Done
assignee: []
created_date: "2026-07-05 13:52"
labels:
  - drift
  - tests
dependencies: []
parent_task_id: TASK-27.1.20
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[MEDIUM — the two most judgement-critical modules have no dedicated unit tests] agentic_modes.ts is the entire agent-facing write surface and affected_flows.ts is the membership/body-drift trigger core — a false negative there is precisely the stale-drift the mechanism exists to prevent, and it fails silently. Neither has a dedicated test; both are exercised only through slow built-bin subprocess suites. Locking their behavior now protects the refactors in .9 (harden writes) and .12 (enrich inventory).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 agentic_modes.test.ts: parse/apply per contract-breach shape, bridge-endpoint-not-in-graph skip, unresolved call span corroboration, apply_descriptions last-wins duplicate collapse — against an in-memory store and a hand-built CallGraph
- [x] #2 affected_flows.test.ts: body-drift only, membership-drift only, both, neither, missing anchor_set self-heal, both zero-seed shapes

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

The two most judgement-critical drift modules — `agentic_modes.ts` (the agent-facing write
surface) and `affected_flows.ts` (the membership/body-drift trigger core) — now carry dedicated,
fast unit tests that run in-process against an `:memory:` store and a hand-built `CallGraph`, with
no Ariadne parse and no built-bin subprocess. A false negative in either module is exactly the
silent stale-drift the mechanism exists to prevent; these tests lock the behaviour before the `.9`
write-hardening and `.12` inventory-enrichment refactors build on it.

## What changed

Three new files, all test-only (no production change):

- `__fixtures__/agentic_graph.ts` — a hand-built `CallGraph` + fake `AriadneAdapter` with per-call-site
  location control (needed to place an unresolved call at a chosen `file:line` for span corroboration),
  a `symbol_id` that can diverge from the flow-layer `symbol_path` (to model the method id-space split
  the description join turns on), repo-relative locations, `sha256`-shaped `content_hash` defaults, and
  a deterministic clock. It mirrors the real producers (`make_ariadne_adapter`,
  `anchored_symbols_from_ariadne`, `build_symbol_path`) so a test passing here would pass against
  reality.
- `agentic_modes.test.ts` (AC#1) — both parse helpers rejected per contract-breach shape (non-object,
  missing array, bad label/rationale/seeds, non-object/malformed bridge and description elements) and
  accepted well-formed; `apply_stitch` corroborating a bridge only against a real unresolved call and
  recording its canonical span (`start_line:start_col-end_line:end_col`) + stitch provenance, skipping a
  resolved call, a callback invocation, and an endpoint absent from the graph, defaulting the site file
  to the one embedded in `src_id`, dropping unknown/double-claimed seeds, and retiring the singleton it
  absorbs; `apply_descriptions` collapsing duplicate symbol_paths last-wins, skipping a path with no
  live anchor, cache-skipping only when BOTH content hash and text match, and persisting under the
  anchor's enclosing-qualified `symbol_path` (the method case) rather than the wire path;
  `build_entrypoint_inventory` scoping to changed files, gathering unresolved sites across the whole
  reachable tree while excluding resolved and callback calls, and excluding test entrypoints.
- `affected_flows.test.ts` (AC#2) — body-drift only, membership-drift only, both, neither (the
  whitespace/comment no-op), missing-`anchor_set` self-heal, and both zero-seed shapes (a skill/doc flow
  left alone because it enumerates member edges; a seed-gone code flow surfaced for retirement only when
  the turn touches its stored seed's file).

## Notable decisions

- **Hand-built graph over a drift-local fixture, not the core `__fixtures__/call_graph.ts`.** The core
  fixture hardcodes call-site locations to line 1, but the span-corroboration gate keys on the exact
  `file:line` of the unresolved call, so a fixture with per-call-site location control was required.
- **The tests were mutation-verified.** Three production regressions (dropping the `is_unresolved_call`
  guard inside `unresolved_call_span`, dropping the content-hash half of the description cache key, and
  persisting under the wire path instead of the anchor path) each fail exactly the tests that assert the
  corresponding guarantee, and nothing else — the suite bites rather than merely passing.

## Orphan discrimination

`build_entrypoint_inventory`'s `is_orphan === false` branch is covered by seeding a live
`code.literal-doc` edge onto one entrypoint's symbol_path in the `:memory:` store: the documented
entrypoint reports `is_orphan: false` while an undocumented sibling reports `true`. The test asserts
both sides, so a regression that flags everything (or nothing) orphan — the spurious-fragment signal
the stitch phase judges on — fails it in either direction.

Files: packages/drift/src/reconcile/agentic_modes.ts, packages/drift/src/reconcile/affected_flows.ts.
Fast in-memory unit tests, not built-bin subprocess suites.
<!-- SECTION:NOTES:END -->
