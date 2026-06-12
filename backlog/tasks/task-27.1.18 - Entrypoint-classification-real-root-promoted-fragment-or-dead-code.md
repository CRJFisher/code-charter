---
id: TASK-27.1.18
title: >-
  Entrypoint classification: every top-level node is judged real root, promoted
  fragment, or dead code — with reasoning
status: To Do
assignee: []
created_date: "2026-06-12 10:31"
labels:
  - drift
  - sub-agents
  - skills
  - docs
dependencies:
  - task-27.1.6.6
references:
  - packages/drift/src/reconcile/agentic_modes.ts
  - packages/drift/src/reconcile/flow_store.ts
  - packages/core/src/agentic/gap_detection.ts
  - packages/drift/assets/skills/drift-sync/SKILL.md
  - packages/drift/assets/agents/drift-reconciler.md
  - docs/comprehension/flow-construction.html
parent_task_id: TASK-27.1
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

**The reframe.** Ariadne's "entrypoints" are not entrypoints — they are the top-level nodes of a syntactic call graph: every function with no in-graph caller. A node is top-level for exactly one of three reasons:

- **(a) real root** — a genuine entrypoint in the context of the whole repo: a server endpoint handler, CLI main, exported library API, framework hook. Correctly its own flow.
- **(b) promoted fragment** — actually called at runtime, but through an indirection Ariadne cannot resolve (registry lookup, dynamic dispatch, callback table). Spuriously promoted to top level; this is what stitching repairs.
- **(c) dead code** — genuinely uncalled; not a live part of the codebase.

Today the system's vocabulary conflates these. `is_orphan` (no documentation edge) is a weak proxy for "suspect", and the agent's only output is binary: stitch, or leave as singleton. An unstitched orphan is ambiguous forever — the reader cannot tell a deliberate "this is a real root" from "the agent looked for the indirection and found none" from "this is probably dead". The judgement happens; its conclusion is thrown away.

**Direction: the agent classifies every entrypoint it judges and persists the reasoning.** Classification is the primary output of Phase 1; a stitch is the side-effect of one class, not the whole job.

High-level plan:

1. **Schema.** The judgement payload gains, per entrypoint: `classification: "real-root" | "promoted-fragment" | "dead-code"` plus a free-text `reasoning` field (one or two sentences citing what the agent found — the framework registration, the failed grep for callers, the export site). Class (b) has two outcomes: connected (the entrypoint becomes a seed in an umbrella — the existing stitch) and recognised-but-unconnected (the agent is confident it's a fragment but could not corroborate the indirection; it stays a singleton, classified, with the reasoning saying why).
2. **Persistence.** Classification + reasoning live on the persisted `agentic.flow` node alongside `label`/`rationale` (`flow_store.ts WriteFlowArgs`), so the UI and later turns can read them. Re-classifying on a later turn is a revision with the same idempotence discipline as descriptions: same value → no-op, different → write. The deterministic floor writes no classification — absence means "not yet judged", and the diagram is still correct.
3. **Bin surface.** Extend the apply path: either widen `stitch.json` into a judgement payload (umbrellas + classifications in one document) or add `--apply-classifications` symmetric with `--apply-descriptions` — decide at implementation; bias toward one payload so a single judgement pass lands atomically per entrypoint. No graph corroboration gate for the class itself — the classification is precisely the judgement the graph cannot make; the evidence bar continues to apply only to bridge edges.
4. **Advisory semantics for dead code.** Class (c) never deletes, retires, or excludes a flow — it is metadata. The UI may demote/grey a dead-classified flow; removal is a human decision. This keeps the worst case fragmented-but-honest, never destructive on a wrong judgement.
5. **Skill + agent reframe.** SKILL.md Phase 1 becomes "classify every entrypoint in the inventory" — with per-class evidence guidance: (a) cite the registration/export/framework evidence; (b) hunt the indirection from both ends, stitch when found; (c) only after grepping for callers, references, exports, and dynamic-dispatch registrations comes up empty. drift-reconciler.md gets the same three-class framing. Installed `.claude/` copies refreshed.
6. **Docs.** `flow-construction.html` re-led with the three-class taxonomy — the split problem becomes "class (b) is the repair target" rather than the whole story; `is_orphan` is presented as the suspicion heuristic, classification as the conclusion. Sibling pages (drift-sync, index front door, architecture) touched where they name orphans.

Interplay with TASK-27.1.17 (entrypoint work list): classification rides the per-item loop naturally — pop one entrypoint, classify it, apply. Not a hard dependency, but whichever lands second adopts the other's shape.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 The judgement payload carries `classification` (real-root | promoted-fragment | dead-code) and `reasoning` per entrypoint, and the bin persists both onto the `agentic.flow` node; re-submitting the same classification is a no-op, a changed one is a revision.
- [ ] #2 A class-(b) entrypoint whose indirection is corroborated is stitched as today; one whose indirection cannot be corroborated persists as a classified singleton with reasoning — no bridge, no merge.
- [ ] #3 Dead-code classification is advisory: no flow is deleted, retired, or excluded from rendering because of it.
- [ ] #4 The deterministic floor is unchanged: an agent-less run writes no classifications and remains byte-identical to the current default reconcile.
- [ ] #5 SKILL.md and drift-reconciler.md frame Phase 1 as three-way classification with per-class evidence guidance; installed `.claude/` copies refreshed.
- [ ] #6 `flow-construction.html` (and sibling pages naming orphans) present the taxonomy: top-level node ≠ entrypoint; `is_orphan` is the heuristic, classification the conclusion.

<!-- AC:END -->
