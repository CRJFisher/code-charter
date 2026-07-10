---
id: TASK-27.1.20.19
title: >-
  Visual grading surface with LLM-judge screening: review the interesting
  cases as diagrams, not JSON
status: To Do
assignee: []
created_date: "2026-07-09"
labels:
  - drift
  - eval
  - dx
  - ui
dependencies:
  - TASK-27.1.20.16
  - TASK-27.1.20.17
references:
  - backlog/tasks/task-26 - Research-and-prototype-a-chart-diff-view-for-module-refactoring-and-generic-plan-visualization.md
parent_task_id: TASK-27.1.20
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The .17 grading queue is terminal-only and unscreened: the developer pages through every ungraded run as text. Two upgrades make grading scale with real usage. First, **screening**: a calibrated LLM judge (per .17 AC#3) pre-grades all ungraded runs and ranks them by interestingness — judge-fail, low judge confidence, disagreement with deterministic signals (drift-inspect --lint anomalies, placeholder ratios) — so the human grades the interesting minority instead of everything. Second, **a visual surface**: drift-sync's subject is diagrams, so judging a case means _seeing_ the flow state before and after, not reading spine JSON — each queued case renders its before/after flow visually alongside the trajectory spine and the judge's screening verdict.

Distinct from task-27.1.10 (deferred product-level review surfaces for end users seeing code↔diagram drift): this is dev-loop instrumentation for judging the mechanism itself, and it ships with the toolkit in packages/drift per decision-10. The surface's implementation is an open choice for the implementer — a batch static-HTML grading sheet (cheapest; verdicts captured by the CLI after viewing) or a dev-mode webview panel reusing the extension's flow renderer (richest; verdicts captured in-panel) — but either front-end writes the same grades contract as the CLI queue.

Grading a run involves two distinct judgements, and the case view serves both. **Action correctness** — was the mechanism's response to the code change right (right flow retired, right members re-anchored, user layer preserved)? — is a delta judgement, viewed as a change-encoded graph. **Representation quality** — is the resulting diagram a good representation of the code now (informative descriptions, sensible grouping)? — is an absolute judgement, viewed as the plain after-state flow. The grader toggles between them; the delta view is the default because the grader authored the underlying code change during real work and carries the ground truth for it.

For the delta view, the visualisation grammar is NOT an open choice: task-26's research survey already settled how to show graph change, with literature backing, and this task adopts its findings rather than re-deriving them — a **difference map**: a single stable-layout flow graph with explicit change encoding (added / removed / modified color halos, moves shown as moves at old and new position), layout anchored from the before state for mental-map preservation. Side-by-side panes, dual badges, and animated transitions are rejected per task-26's recorded reasons. The before/after pair is expressed as task-26's ChartDiff data model, making this surface ChartDiff's second consumer (one short of the rule-of-three for lifting it).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A screening pass pre-grades all ungraded runs with the calibrated judge and orders the human queue by interestingness (judge-fail first, then low-confidence, then disagreement with deterministic lint signals); screening cost per run is recorded
- [ ] #2 Judge verdicts are recorded in the grades sidecar with a grader field (human | judge) so judge grades never masquerade as human goldens, and .17's calibration can be recomputed from the same file at any time
- [ ] #3 A blind-spot control mixes a configurable random sample of judge-passed runs into the human queue, so the judge's misses stay discoverable rather than becoming permanent
- [ ] #4 Each case renders the flow-state change as a single stable-layout difference map per task-26's grammar (before-anchored layout; added/removed/modified explicit encoding; moves shown as moves, not delete+add) — never side-by-side panes or raw JSON — expressed via the ChartDiff data model, with a toggle to the plain after-state flow (no change encoding) for judging representation quality absolutely
- [ ] #5 Drift-specific state is legible on the difference map at a glance: description changes carry their source (docstring / placeholder / llm), preservation outcomes are visible (user-layer fields carried vs landed in recovery), and retirements/deferrals are distinguished from ordinary removals
- [ ] #6 The salient spine (.16) and the judge's screening verdict + rationale are presented beside the difference map, so a verdict never requires leaving the case view
- [ ] #7 The surface consumes only the neutral spine schema (.16 AC#3) and the pinned grades contract (.17 AC#5), and writes verdicts through the same grades records as the CLI queue — one contract, two front-ends (seam discipline per decision-10)

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

**Inherited operational loop (closes .17 AC#2 and seeds .13 AC#6).** The three-fixture
bergamot harvest was deferred out of .17 because grading needs this task's surface: a
2026-07-10 grading attempt over text screenfuls was retracted by the grader as
uninterpretable — the direct field evidence this task exists to answer (recorded in
.17's notes). Once the surface lands:

1. Install the current drift build into bergamot and work normally — real session runs
   accumulate with full trajectory context.
2. Grade the queue here (screened, visual).
3. Harvest at least three good-graded runs with `drift-harvest` into
   `stitch_eval_harvested/` — that closes .17 AC#2's three-fixture step and starts the
   harvest-primary fixture corpus .13 AC#6 defers to. Every harness-side piece (loader,
   --no-agent skip, decline wrap) already ships; the corpus lands with zero further
   harness changes.
<!-- SECTION:NOTES:END -->
