---
id: DECISION-10
title: >-
  Feedback-loop tooling lives in-package; seams are pinned contracts;
  abstraction at the third consumer
date: "2026-07-09"
status: accepted
---

## Context

The drift feedback-loop toolkit (reconcile run log, trajectory view, grading queue,
golden harvest, judge calibration — TASK-27.1.20.3/.4/.15/.16/.17) is development
instrumentation, not product code. Two placements were considered: keep it in
`packages/drift`, or abstract it now to a user-level toolkit alongside the `sr-` skill
suite. The tension: abstraction promises reuse and keeps analytics machinery out of
code-charter; premature abstraction produces an interface with one implementer — the
exact failure the `sr-` suite already retired once (the owner-less PROTOCOL lesson:
an interface earns its existence only when multiple peer implementers exist).

## Decision

Battle-tested concretion with named seams. The toolkit stays in `packages/drift` —
a mechanism's feedback loop is part of the mechanism — built seam-aware:

1. **Every sidecar and JSON output format is a pinned contract doc** in
   `packages/drift`, versioned, owned by its single consumer today.
2. **Generic fields are structurally quarantined from drift fields**: run/grade/spine
   records carry the mechanism-agnostic keys (`run_id`, `session_id`, `verdict`,
   `reason`, `graded_at`, spine step kinds) at top level and drift-specific payloads
   under a nested `detail` key.
3. **The trajectory spine schema is neutral by construction**: four step kinds —
   `instruction | context | judgement | effect` — with drift populating `detail`;
   renderers and the grading queue consume only the neutral fields.
4. **Read-side tools are standalone bins taking paths** (run log, transcript, grades
   as arguments), never importing drift engine internals on the render path.

**Promotion signal:** a third concrete consumer of the run-record → trajectory →
grade → golden shape (beyond drift and the `sr-` suite's parallel implementation).
When it appears, the contract docs — not the code — are what lift to a shared home,
generalised from three battle-tested implementations. Until then, no shared package,
no new prefix suite, no plugin layer.

## Consequences

- code-charter carries only drift-shaped instrumentation, as dev bins beside
  `stitch_eval`; the bloat vector (generic machinery) is excluded by rule 4.
- The eventual lift is a relocation of contract docs plus thin tools, not a redesign,
  because rules 1–3 make the generic surface explicit from day one.
- The `sr-` suite is not retrofitted onto shared code; its own implementations stand
  as the second reference point the eventual abstraction generalises from.
