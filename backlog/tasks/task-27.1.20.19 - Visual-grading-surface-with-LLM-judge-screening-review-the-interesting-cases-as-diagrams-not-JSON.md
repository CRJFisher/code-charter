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
parent_task_id: TASK-27.1.20
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The .17 grading queue is terminal-only and unscreened: the developer pages through every ungraded run as text. Two upgrades make grading scale with real usage. First, **screening**: a calibrated LLM judge (per .17 AC#3) pre-grades all ungraded runs and ranks them by interestingness — judge-fail, low judge confidence, disagreement with deterministic signals (drift-inspect --lint anomalies, placeholder ratios) — so the human grades the interesting minority instead of everything. Second, **a visual surface**: drift-sync's subject is diagrams, so judging a case means _seeing_ the flow state before and after, not reading spine JSON — each queued case renders its before/after flow visually alongside the trajectory spine and the judge's screening verdict.

Distinct from task-27.1.10 (deferred product-level review surfaces for end users seeing code↔diagram drift): this is dev-loop instrumentation for judging the mechanism itself, and it ships with the toolkit in packages/drift per decision-10. The surface's implementation is an open choice for the implementer — a batch static-HTML grading sheet (cheapest; verdicts captured by the CLI after viewing) or a dev-mode webview panel reusing the extension's flow renderer (richest; verdicts captured in-panel) — but either front-end writes the same grades contract as the CLI queue.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A screening pass pre-grades all ungraded runs with the calibrated judge and orders the human queue by interestingness (judge-fail first, then low-confidence, then disagreement with deterministic lint signals); screening cost per run is recorded
- [ ] #2 Judge verdicts are recorded in the grades sidecar with a grader field (human | judge) so judge grades never masquerade as human goldens, and .17's calibration can be recomputed from the same file at any time
- [ ] #3 A blind-spot control mixes a configurable random sample of judge-passed runs into the human queue, so the judge's misses stay discoverable rather than becoming permanent
- [ ] #4 Each case presents the before/after flow state visually (rendered diagrams, not raw JSON) alongside the salient spine and the judge's screening verdict + rationale
- [ ] #5 The surface consumes only the neutral spine schema (.16 AC#3) and the pinned grades contract (.17 AC#5), and writes verdicts through the same grades records as the CLI queue — one contract, two front-ends (seam discipline per decision-10)

<!-- AC:END -->
