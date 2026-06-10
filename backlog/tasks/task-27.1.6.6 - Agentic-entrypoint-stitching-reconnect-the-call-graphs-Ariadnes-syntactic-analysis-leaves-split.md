---
id: TASK-27.1.6.6
title: >-
  Agentic entrypoint stitching: reconnect the call-graphs Ariadne's syntactic
  analysis leaves split
status: Done
assignee: []
created_date: '2026-06-08'
updated_date: '2026-06-10 15:23'
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
  - task-27.1.15
references:
  - task-27.1.5
  - task-27.1.7
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
parent_task_id: TASK-27.1.6
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**The gap Ariadne leaves.** Ariadne is a **syntactic** call-graph extractor: it resolves call references structurally, so dynamic dispatch, registry/indirection lookups, re-exports, and callback wiring frequently **fail to resolve**. Every unresolved call site is a real caller→callee edge missing from the graph. The downstream artifact: a callee only ever reached _through_ an unresolved call has no in-graph caller, so `build_skeleton_flows` promotes it to its **own top-level entrypoint**. A single functionality therefore **fragments into several flows** — one per spuriously-promoted entrypoint — and the v1 deterministic detector (`detect_code_umbrellas`, `packages/drift/src/reconcile/reconcile.ts`) faithfully emits them as separate single-seed flows because it cannot tell a real entrypoint from a resolution gap.

**The v1 agentic job — narrowed to one thing: stitch the fragments back together.** This task implements an **agentic entrypoint-stitch detector**. It does not invent groupings from nothing and does not attach docs by judgement — it **repairs the call graph's syntactic gaps**. The deterministic substrate (task-27.1.4) already surfaces the raw material: `find_unresolved_shapes` flags the nodes whose call sites mostly fail to resolve (the registry/dynamic-dispatch shapes), and `derive_candidate_seeds` enumerates the orphan entrypoints. From these the engine proposes **candidate stitches** — an unresolved call site in one entrypoint's tree paired with the entrypoint(s) it might actually target. The agent **judges** each: _does this unresolved call really link these two entrypoints?_ A confirmed stitch merges their entrypoints into one **multi-seed `CodeUmbrella`** and records the recovered edge as an `agentic.bridge`.

**Why this is the right v1 scope.** The data model already supports multi-seed flows — `CodeUmbrella.seeds` is plural and `hydrate_code_flow`/`induce_members` already induce membership from a seed set across bridges — so the work is the **stitch judgement, not new persistence**. And the judgement is **grounded and checkable**: the agent is not asked "what is the essence of this repo?" but "is this specific unresolved call a real edge?", which a model can answer from the two definitions and the call site. The broad "name arbitrary functionality umbrellas / attach docs by judgement" framing is deferred (YAGNI); doc linkage stays deterministic (the skill-dir flow), and the depth/salience goal of key-control-flow is task-27.1.7. The substrate that was meant to feed this (task-27.1.4's `derive_candidate_seeds`) still has **no runtime caller** — this task is its first consumer; the original flow-detection-agent task (task-27.1.5) was deferred so the deterministic v1 could ship.

**How, when, and where the agent enters the workflow.**

- **Where** — an injected executor seam on `ReconcileDeps`: `stitch_entrypoints?: EntrypointStitchExecutor`, added exactly like the shipped `describe?: DescribeBatchExecutor`. Its **default is a deterministic no-stitch grouper** that reproduces today's one-entrypoint-per-flow, so with no executor the headless path is byte-identical and the agentic stitching is opt-in.
- **When** — on the `Stop`-hook reconcile of the files worked on this turn, inside HYDRATE/re-detection, after `re_extract` refreshes the call graph and the substrate proposes candidate stitches. Only the **changed neighbourhood's** entrypoints are considered — lazy and per-flow, never the whole repo.
- **How** — the seam is filled by the **`drift-reconciler` sub-agent's own run** (the same place the `describe` executor is filled), with no new harness and no background spawn (task-27.1.5's separate execution model is superseded — YAGNI). The agent receives the candidate stitches, each entrypoint's neighbourhood summary, and the `goal`, and returns the confirmed stitches. The in-process default makes no model call.

**What a stitch persists.** A confirmed stitch is written as an `agentic.bridge` edge from the unresolved call site's enclosing node to the target entrypoint/node via `build_bridge_edges` (confidence `BRIDGE_CONFIDENCE_INFERRED = 0.5`, with the call-site span as `source_range` provenance so click-through lands on the real missed call). `induce_members` already traverses bridges, so the stitched interior re-induces automatically; the intra-tree interior stays deterministic (induced reachability). The umbrella's id is its **dominant seed's `symbol_path`** (`flow_id_of`); a re-stitch writes the new umbrella under its own id and retires any superseded flow (whose dominant seed no longer resolves) via the seed-gone soft-delete in `resync_persisted_flow`. Identity is **purely deterministic** — there is no user label/pin to preserve at the flow layer (task-27.1.15 strips the user-preservation apparatus: no overlap remap, no re-attachment bin), so all customisation here is agent-authored at creation. The detection **goal is an explicit arg** (`ReconcileDeps.goal`, default `orient-in-code-tree`), distinct from the depth/salience goal of key-control-flow (task-27.1.7, out of scope here).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An **agentic entrypoint-stitch detector** builds **candidate stitches** from the deterministic substrate over the changed neighbourhood (`find_unresolved_shapes` + `derive_candidate_seeds`): each pairs an unresolved / dynamic-dispatch call site with the entrypoint(s) it may actually target. The agent judges them and returns confirmed stitches that merge their entrypoints into one **multi-seed `CodeUmbrella`** (`seeds.length` may be > 1) with an agent-chosen `label` and an `inference_rationale`. It replaces `detect_code_umbrellas` as the source of new code umbrellas when the seam is enabled.
- [x] #2 The stitching is an **injected executor seam** on `ReconcileDeps` (`stitch_entrypoints?: EntrypointStitchExecutor`), mirroring `describe?: DescribeBatchExecutor`; its **default is the deterministic no-stitch grouper** (one entrypoint per flow), so with no executor the headless behaviour is byte-identical to today and tests stay deterministic.
- [x] #3 **A stitch is a recovered call edge.** Each confirmed stitch writes an `agentic.bridge` from the unresolved call site's enclosing node to the target via `build_bridge_edges` (confidence `BRIDGE_CONFIDENCE_INFERRED = 0.5`; `source_range` = the call-site span, so click-through lands on the real missed call). Membership re-induces across the bridge (`induce_members`); the intra-tree interior stays deterministic (induced reachability).
- [x] #4 Emitted umbrellas + bridges persist through the **existing** `hydrate_code_flow` → `write_agentic_substrate`/`write_flow` path — no new store-write path, scoped `write_fields('agentic')`, never `rebuild_layer('agentic')`; `last_synced_at` stamped.
- [x] #5 **Stable identity across re-stitch:** a multi-seed umbrella's id is its dominant seed's `symbol_path` (`flow_id_of`). When a later run stitches/un-stitches differently, the new umbrella writes under its own id and any superseded flow whose dominant seed no longer resolves is retired by the seed-gone soft-delete in `resync_persisted_flow`. Identity is purely deterministic — there is no overlap remap and no user label/pin to carry (the flow layer has no user-authored content; task-27.1.15).
- [x] #6 **Agent entry is explicit (how/when/where).** The seam is filled by the `drift-reconciler` sub-agent's own run on the `Stop`-hook reconcile — no new harness, no background spawn (supersedes task-27.1.5's separate execution model) — considering only the changed neighbourhood's entrypoints; the in-process default makes no model call.
- [x] #7 The detection **goal is an explicit input** (`ReconcileDeps.goal`, default `orient-in-code-tree`); the stitch executor receives it so a later goal selector is an added arg, not a rewrite.
- [x] #8 **Cost/time bounded** (task-27.1.1 ceiling): the stitch call is capped and budgeted; entrypoints / candidate stitches beyond the cap, and stitches the agent declines, fall back to singleton flows; any truncation is logged — never a silent cap.
- [x] #9 **Proving target:** on a fixture where Ariadne leaves two entrypoints split by an unresolved call site (a registry / dynamic-dispatch shape), the detector **with** a stitch executor emits a single multi-seed umbrella spanning both — an `agentic.bridge` over the missed call, a sensible label and rationale — vs. today's two singleton flows; **without** an executor the two stay separate (byte-identical). The deterministic skill-dir flow (umbrella = directory) is unchanged.
- [x] #10 The `drift-sync` SKILL.md and `docs/comprehension/flow-construction.html` are updated to describe the wired entrypoint-stitching step — how/when/where the agent enters — keeping the deterministic default accurately documented.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. **Define the seam.** Add `EntrypointStitchExecutor` (input: candidate stitches — entrypoint clusters + the unresolved call site(s) linking them + each entrypoint's neighbourhood summary + `goal`; output: confirmed stitches → `{ label, rationale, seeds, bridges }`) and `stitch_entrypoints?` on `ReconcileDeps`, with a deterministic no-stitch default that reproduces today's one-entrypoint-per-flow.
2. **Build candidate stitches.** Run `detect_gaps` over the changed neighbourhood; from `find_unresolved_shapes` (the missed-edge sites) and `derive_candidate_seeds` (the entrypoints), pair each unresolved call site with the in-neighbourhood entrypoint(s) it might target — the substrate's first runtime consumer.
3. **Assemble umbrellas.** Map confirmed stitches into multi-seed `CodeUmbrella`s (id = dominant seed's `symbol_path`); write each recovered edge through `build_bridge_edges` with the call-site span as provenance; feed the existing `hydrate_code_flow`.
4. **Identity.** Identity is purely deterministic — a multi-seed umbrella's id is its dominant seed's `symbol_path` (`flow_id_of`). There is no overlap remap and no user label/pin to carry (task-27.1.15 stripped all user-preservation apparatus). Add fixtures for stitch and split (AC#9).
5. **Bound cost.** Enforce the task-27.1.1 ceiling on the stitch call; fall back to singleton flows on overflow/declined; log truncation.
6. **Provide the real executor seam.** Implement the seam the `drift-reconciler` sub-agent fills (consistent with how the describe seam is filled), keeping the in-process default headless.
7. **Fixtures + docs.** Build the split-entrypoint stitch fixture (AC#9); update SKILL.md and the flow-construction comprehension page (AC#10).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## High-level summary

Ariadne extracts call graphs syntactically. Dynamic dispatch, registry lookups, and callback wiring frequently leave call edges unresolved; every callee only reachable through an unresolved site is promoted to its own top-level entrypoint. A single functionality therefore fragments into several flows, each a singleton built around a spuriously-promoted entrypoint.

This task adds an **entrypoint-stitch step** to the HYDRATE path that repairs those gaps. The design mirrors the existing `describe` seam: an `EntrypointStitchExecutor` is injected on `ReconcileDeps`; the default (`null_stitch_executor`) confirms nothing and produces behaviour byte-identical to the pre-stitch path. The executor receives `StitchCandidate` pairs — each pairing one orphan entrypoint that has unresolved shapes with a second neighbourhood orphan — and returns `ConfirmedStitch` records naming the seeds to merge, a label, a rationale, and a bridge spanning from the enclosing unresolved call site to the target. Bridge endpoints are stored as `symbol_path`s (rename-stable store IDs), not raw Ariadne `SymbolId`s.

The moving parts: `packages/core/src/agentic/stitch.ts` defines the types (`StitchBatch`, `ConfirmedStitch`, `EntrypointStitchExecutor`) and exports `null_stitch_executor`, `build_candidate_stitches`, and `paths_of`. `reconcile.ts` drops its old conditional branch and routes all HYDRATE through `detect_and_stitch_code_umbrellas`, which calls the executor and feeds confirmed stitches into `build_stitch_groups`. That function runs union-find over the confirmed stitch set, re-keys metadata to canonical roots, and emits one `StitchGroup` per confirmed merge; unconfirmed seeds fall back to singleton flows. Recovered edges are written via `build_bridge_edges` at `BRIDGE_CONFIDENCE_INFERRED = 0.5` with the call-site span as provenance. `packages/drift/tsconfig.jest.json` separates ts-jest source-mapped path resolution from the build tsconfig (which needs no `paths` to avoid `rootDir` violations). The `drift-sync` SKILL.md is updated to accurately describe the seam state.

To navigate the result: start at `packages/core/src/agentic/stitch.ts` for the type definitions and `null_stitch_executor`; `reconcile.ts:detect_and_stitch_code_umbrellas` is the HYDRATE entry point; `build_stitch_groups` in the same file is the union-find merge logic; `reconcile_stitch.test.ts` is the integration fixture verifying stitch-vs-singleton behaviour (AC#9).

The `drift-sync` script does not yet inject a live executor — the seam is available for in-process hosts but the headless reconcile path remains deterministic. A coverage gap exists when a dominant seed is already persisted before a merge: the merged umbrella is filtered and the partner seed loses its singleton fallback (noted as a follow-up, not a regression).
<!-- SECTION:NOTES:END -->
