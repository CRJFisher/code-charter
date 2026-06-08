---
id: TASK-27.1.6.6
title: "Agentic flow detection: group call-graphs + docs into functionality umbrellas"
status: To Do
assignee: []
created_date: "2026-06-08"
labels:
  - drift
  - sub-agents
  - skills
  - flows
  - agentic
  - graph-db
dependencies:
  - task-27.1.4
  - task-27.1.6
  - task-27.1.6.4
references:
  - task-27.1.5
  - task-27.1.7
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
parent_task_id: TASK-27.1.6
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

v1 flow detection is **deterministic and headless**: `detect_code_umbrellas` (`packages/drift/src/reconcile/reconcile.ts`) builds **one flow per entrypoint** — a single skeleton flow (`build_skeleton_flows`) whose membership is that entrypoint's reachable subgraph. There is **no agentic grouping**: nothing links several call-graphs (or call-graphs + docs) under a single **functionality umbrella**, so a repo surfaces as "one flow per top-level entrypoint" rather than "the few umbrellas that convey the essence of the code-tree." That essence-grouping is the whole point of the agentic (L1) lane and is currently unimplemented — the substrate that was meant to feed it (task-27.1.4's `derive_candidate_seeds`) has **no runtime caller**, and the original flow-detection-agent task (task-27.1.5) was deferred so the deterministic v1 could ship.

This task implements the agentic flow detector: a pass that **groups deterministic seeds into functionality umbrellas**, attaches related docs, and infers cross-call-graph **`agentic.bridge`** links, emitting **multi-seed** flows that upgrade the deterministic stubs **in place** on the agentic lane (`layer='agentic'`, `confidence` below raw, `inference_rationale` in the attributes bag). The data model already supports this — `CodeUmbrella` carries `seeds: readonly SymbolId[]` (plural) and `hydrate_code_flow` already induces members from a seed set — so the work is the **grouping judgement**, not new persistence.

**Execution model — aligns with the shipped v1, no new harness.** The grouping is the LLM judgement seam of the existing `drift-reconciler` sub-agent + `drift-sync` skill, exactly mirroring the **describe seam** already on `ReconcileDeps` (`describe?: DescribeBatchExecutor`, defaulting to `null_describe_executor`). A new optional `group_umbrellas?` executor is injected the same way and **defaults to the current deterministic one-entrypoint-per-flow grouper**, so the headless path is unchanged and the agentic grouping is opt-in. This deliberately drops task-27.1.5's separate background-spawn execution model (superseded by the Stop-hook foreground sub-agent that v1 shipped) — YAGNI.

**The substrate/agent boundary stays explicit** (task-27.1.4 AC#4): the deterministic substrate **proposes** candidate seeds and bridge material; the agent **judges** which seeds form one umbrella, names it, and justifies it. The detection **goal is an explicit arg** (`ReconcileDeps.goal`, default `orient-in-code-tree` — breadth: the few umbrellas), distinct from the depth/salience goal of key-control-flow (task-27.1.7, out of scope here).

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 An **agentic umbrella detector** groups multiple deterministic seeds (from task-27.1.4's `derive_candidate_seeds` over the changed flows' neighbourhood) into one or more **functionality umbrellas**, each emitted as a multi-seed `CodeUmbrella` (`seeds.length` may be > 1) with an agent-chosen `label` and an `inference_rationale`. It replaces `detect_code_umbrellas` as the source of new code umbrellas when the grouping seam is enabled.
- [ ] #2 The grouping is an **injected executor seam** on `ReconcileDeps` (e.g. `group_umbrellas?: UmbrellaGroupingExecutor`), mirroring `describe?: DescribeBatchExecutor`; its **default is the deterministic one-entrypoint-per-flow grouper**, so with no executor the headless behaviour is byte-identical to today and tests stay deterministic.
- [ ] #3 The detector **links docs and infers cross-call-graph bridges**: related doc nodes join membership, and agent-inferred cross-tree links are written as `agentic.bridge` edges via `build_bridge_edges` (confidence `BRIDGE_CONFIDENCE_INFERRED = 0.5`, each with a justifying `source_range` provenance). The intra-tree interior remains deterministic (induced reachability).
- [ ] #4 Emitted umbrellas persist through the **existing** `hydrate_code_flow` path — no new store-write path, scoped `write_fields('agentic')`, never `rebuild_layer('agentic')`; `last_synced_at` stamped.
- [ ] #5 **Stable identity across regrouping:** a multi-seed umbrella's id is its dominant seed's `symbol_path` (`flow_id_of`), so when a later run splits/merges umbrellas the task-27.1.6 ≥50% overlap remap (`match_existing_flow`) carries the user-owned label/pin across the id change and strands the superseded flow into the re-attachment bin — a re-run never silently drops a user rename/pin.
- [ ] #6 The detection **goal is an explicit input** (`ReconcileDeps.goal`, default `orient-in-code-tree`); the grouping executor receives it so a later goal selector is an added arg, not a rewrite.
- [ ] #7 **Cost/time bounded** (task-27.1.1 ceiling): the grouping call is capped and budgeted; seeds the agent does not group fall back to singleton stub flows above the cap, and any truncation is logged — never a silent cap.
- [ ] #8 **Proving target:** on a fixture repo where several top-level entrypoints belong to one functionality, the detector emits a single multi-seed umbrella spanning them (vs. today's N singleton flows), with a sensible label and rationale; the deterministic skill-dir flow (umbrella = directory) is unchanged.
- [ ] #9 The `drift-sync` SKILL.md and `docs/comprehension/flow-construction.html` are updated to describe the now-wired agentic grouping (the "designed-future" lane becomes the live path when the seam is enabled), keeping the deterministic default accurately documented.

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. **Define the seam.** Add `UmbrellaGroupingExecutor` (input: candidate seeds + a call-graph/doc-neighbourhood summary + `goal`; output: seed groups → `{ label, rationale, doc_node_ids?, bridges? }`) and `group_umbrellas?` on `ReconcileDeps`, with a deterministic default that reproduces today's one-seed-per-skeleton grouping.
2. **Wire the candidate substrate.** Call task-27.1.4's `derive_candidate_seeds` over the changed flows' neighbourhood to produce the seed set the executor groups (this is the substrate's first runtime consumer).
3. **Assemble umbrellas.** Map executor output into multi-seed `CodeUmbrella`s (id = dominant seed's `symbol_path`), attach docs, and pass agent-inferred bridges through `build_bridge_edges`; feed the existing `hydrate_code_flow`.
4. **Identity & preservation.** Confirm the ≥50% overlap remap (`apply_remap`/`match_existing_flow`) carries labels across split/merge for multi-seed flows; add fixtures for split and merge.
5. **Bound cost.** Enforce the task-27.1.1 ceiling on the grouping call; fall back to singleton stubs on overflow; log truncation.
6. **Provide a real executor.** Implement the executor the `drift-reconciler` sub-agent fills (consistent with how the describe seam is filled), keeping the in-process default headless.
7. **Fixtures + docs.** Build the multi-entrypoint grouping fixture (AC#8); update SKILL.md and the flow-construction comprehension page (AC#9).

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
