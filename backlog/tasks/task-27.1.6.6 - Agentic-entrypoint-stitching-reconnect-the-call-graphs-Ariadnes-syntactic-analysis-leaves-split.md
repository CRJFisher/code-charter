---
id: TASK-27.1.6.6
title: >-
  Agentic entrypoint stitching: the skill orchestrates the agent to stitch and
  describe over three thin bin modes
status: To Do
assignee: []
created_date: '2026-06-08'
updated_date: '2026-06-11 13:12'
labels:
  - drift
  - sub-agents
  - skills
  - flows
  - agentic
  - refactor
  - purge
dependencies:
  - task-27.1.4
  - task-27.1.6
  - task-27.1.6.4
  - task-27.1.15
references:
  - task-27.1.5
  - task-27.1.7
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
  - >-
    backlog/tasks/task-27.1.6.6 -
    Agentic-entrypoint-stitching-disk-handoff.plan.html
parent_task_id: TASK-27.1.6
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**The gap Ariadne leaves.** Ariadne is a syntactic call-graph extractor: dynamic dispatch, registry/indirection lookups, re-exports, and callback wiring frequently fail to resolve. Every unresolved call site is a real caller→callee edge missing from the graph, and a callee reached only through an unresolved site has no in-graph caller, so `build_skeleton_flows` promotes it to its own top-level entrypoint. A single functionality therefore fragments into several singleton flows — one per spuriously-promoted entrypoint.

**The agentic job: an agent stitches the fragments back together and writes the descriptions.** An earlier iteration of this task shipped the deterministic plumbing but left the agent unwired — it added two injected-function seams on `ReconcileDeps` (`EntrypointStitchExecutor`, default `null_stitch_executor`; `DescribeBatchExecutor`, default `null_describe_executor`) and the only code that ever supplies a real executor is the test files. Production runs `drift-reconcile` → `reconcile()` with neither seam set, so the whole reconcile chain (`Stop` hook → `drift-reconciler` sub-agent → `drift-sync` skill → `drift_sync.js` → `drift-reconcile` bin) executes fully headless: no model judges anything, the fragmented orphans stay fragmented, and member descriptions stay docstring-or-name-placeholder. The injected-function seam is scaffolding for an in-process model call the architecture never makes — the bin runs `spawnSync` to completion and the sub-agent (which _is_ a model context) has no way to inject judgement into a synchronous headless process.

**The approach: the SKILL owns the intelligence; the bin becomes three dumb store-facing verbs.** The `drift-sync` skill orchestrates the sub-agent through two judgement phases, and the agent does its own codebase exploration (grep/Read) rather than consuming a pre-baked agenda. This deletes two whole layers of TypeScript — both the executor seams _and_ the candidate-pairing / union-find / agenda substrate that fed them — because the agent, not the engine, now decides the flow shape.

**The two judgements, both living in `SKILL.md`:**

- **Phase 1 — stitch.** The agent calls `drift-reconcile --list-entrypoints`, which emits the changed neighbourhood's entrypoint inventory: every orphan entrypoint Ariadne detected (`symbol_path`, name, `file:line`, `is_orphan`) plus the unresolved call sites in their trees (`file`, `line`, `source_line` — e.g. `handlers[key]()`, `run()`). The agent **sees Ariadne's entrypoints and explores the codebase** (grep for `register(`, read the call sites and definitions) to decide which orphans actually belong to one functionality. It writes `stitch.json` — `{ umbrellas: [{ label, seeds, bridges, rationale }] }` — and calls `drift-reconcile --apply-stitch stitch.json`, which hydrates each multi-seed `CodeUmbrella` with its `agentic.bridge` edges and returns the established flow shape (`{ flows: [{ id, members: [{ symbol_path, name }] }] }`).
- **Phase 2 — describe.** With the flow shape established, the agent reads each member and writes a **short but descriptive** sentence — just enough to explain what is going on — then calls `drift-reconcile --apply-descriptions descriptions.json` (`{ descriptions: [{ symbol_path, text }] }`) to persist them.

The two judgements are the two gaps between the three script calls; the scripts are deterministic store writes, the reasoning is the agent's own.

**What is purged.** The executor seams (`EntrypointStitchExecutor`, `null_stitch_executor`, `stitch_entrypoints?`, `DescribeBatchExecutor`, `null_describe_executor`, `describe?`, the `deps.stitch_entrypoints ?? null_stitch_executor` fallback in `reconcile.ts`, their re-exports, the test executor mocks) **and** the candidate/merge layer that only existed to feed an in-process executor: `build_candidate_stitches`, `StitchCandidate`, `StitchBatch`, `MAX_STITCH_CANDIDATES`, `build_stitch_groups` (union-find), and `detect_and_stitch_code_umbrellas`. A grep confirms these have no consumers outside `reconcile.ts` and the test files. Most or all of `packages/core/src/agentic/stitch.ts` deletes — `ConfirmedStitch` is replaced by reusing the existing `CodeUmbrella` (`hydrate.ts:53`, already `{ id, label, seeds, bridges?, rationale? }`) and `BridgeCandidate` as the `--apply-stitch` wire format, so no new type is needed.

**What is kept** (the genuine substrate): entrypoint/orphan enumeration (`find_orphan_entrypoints`, `find_unresolved_shapes`) to produce the `--list-entrypoints` inventory; `induce_members`, `build_bridge_edges`, `hydrate_code_flow`, `write_flow` and the scoped store-write primitives; the deterministic resync/retire/skill-dir reconcile path, unchanged and headless (only _new_ orphan code flows need the agent — resync and retire ride the `--list-entrypoints` pass); and a thin content-hash description-cache skip so unchanged nodes are not re-described every sync.

**Cost/scope bounds (task-27.1.1 ceiling).** `--list-entrypoints` reports the orphan/unresolved inventory only for the changed neighbourhood, never the whole repo. Over-large inventories are reported on stderr (never a silent cap); the agent stitches what it can judge and the rest fall back to singleton flows. The `agentic.bridge` confidence stays `BRIDGE_CONFIDENCE_INFERRED = 0.5`, with the unresolved call-site span as `source_range` provenance so click-through lands on the real missed call. Identity stays purely deterministic — a multi-seed umbrella's id is its dominant seed's `symbol_path` (`flow_id_of`); there is no user label/pin to preserve at the flow layer (task-27.1.15).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Executor seams purged.** `EntrypointStitchExecutor`, `null_stitch_executor`, `stitch_entrypoints?`, `DescribeBatchExecutor`, `null_describe_executor`, `describe?`, the `reconcile.ts` executor fallback, and their re-exports are deleted. No `*_executor` injected-function seam remains on `ReconcileDeps`; a repo grep for the removed identifiers returns only this task's history.
- [ ] #2 **Candidate/merge/agenda layer purged.** `build_candidate_stitches`, `StitchCandidate`, `StitchBatch`, `MAX_STITCH_CANDIDATES`, `build_stitch_groups`, and `detect_and_stitch_code_umbrellas` are deleted; `packages/core/src/agentic/stitch.ts` deletes (or shrinks to only still-consumed exports). No candidate-pairing or union-find runs in the reconcile path.
- [ ] #3 **`drift-reconcile` exposes exactly three agentic modes.** `--list-entrypoints` emits `{ entrypoints: [{ symbol_path, name, file, line, is_orphan, unresolved_sites: [{ file, line, source_line }] }] }` for the changed neighbourhood and runs the deterministic resync/retire/skill-dir reconcile (no new-code-flow hydration). `--apply-stitch <json>` consumes `{ umbrellas: [{ label, seeds, bridges, rationale }] }`, hydrates each as a multi-seed `CodeUmbrella` + `agentic.bridge` edges, and returns `{ flows: [{ id, members: [{ symbol_path, name }] }] }`. `--apply-descriptions <json>` consumes `{ descriptions: [{ symbol_path, text }] }` and persists them through the scoped write path.
- [ ] #4 **`drift-sync` SKILL.md orchestrates the two judgements.** The skill drives the sub-agent through phase 1 (list → judge-stitch → apply-stitch) and phase 2 (judge-describe → apply-descriptions). The "no model call is required" framing is removed; the skill documents that the agent explores the codebase to judge stitches and authors descriptions.
- [ ] #5 **The sub-agent can explore.** `drift-reconciler` gains `Read` and `Grep` (alongside `Skill`, `Bash`) and its instructions describe the two-phase flow. An empty inventory (no orphans, no unresolved sites) short-circuits both judgement phases and the result is byte-identical to today's deterministic output.
- [ ] #6 **Stitch persistence is unchanged downstream.** A confirmed stitch reuses `build_bridge_edges` (`BRIDGE_CONFIDENCE_INFERRED = 0.5`, call-site span as `source_range`) and `hydrate_code_flow` → `write_flow` / `write_agentic_substrate`; membership re-induces across the bridge (`induce_members`); the umbrella id is its dominant seed's `symbol_path` (`flow_id_of`); identity stays purely deterministic.
- [ ] #7 **Proving target (deterministic).** `reconcile_stitch.test.ts` is rewritten to the script boundary: feeding `--apply-stitch` a golden `umbrellas` JSON over the split-entrypoint fixture yields one multi-seed umbrella with the bridge over the missed call; feeding it no umbrellas (or running `--list-entrypoints` alone) leaves the orphans as singleton flows. No executor mock remains.
- [ ] #8 **Docs updated.** `docs/comprehension/flow-construction.html` describes the skill-orchestrated two-phase model and the three bin modes; the agentic-stitching companions reflect the purge (no executor seam, no agenda layer).
<!-- AC:END -->

## Implementation Plan
<!-- SECTION:PLAN:BEGIN -->
1. **Purge the executor seams.** Delete `EntrypointStitchExecutor`/`null_stitch_executor`/`DescribeBatchExecutor`/`null_describe_executor`, the `stitch_entrypoints?`/`describe?` fields on `ReconcileDeps`, the `reconcile.ts` fallback, and all re-exports (`core/index.ts`, `drift/reconcile/index.ts`, `describe.ts`). Make `resolve_descriptions` take resolved descriptions rather than an executor.
2. **Purge the candidate/merge layer.** Delete `build_candidate_stitches`, `StitchCandidate`, `StitchBatch`, `MAX_STITCH_CANDIDATES`, `build_stitch_groups`, `detect_and_stitch_code_umbrellas`; delete or shrink `stitch.ts`. Re-point the new-code-flow path at orphan enumeration (`find_orphan_entrypoints` / `find_unresolved_shapes`) for the `--list-entrypoints` output, and at a trivial `umbrellas-json → CodeUmbrella[]` mapper for `--apply-stitch`.
3. **Add the three bin modes** to `drift-reconcile`: `--list-entrypoints` (enumerate + deterministic resync/retire), `--apply-stitch <json>`, `--apply-descriptions <json>`, each with a pinned JSON contract and stderr diagnostics. The default no-arg reconcile keeps the deterministic resync/retire behaviour for hosts without an agent.
4. **Rewrite `drift-sync` SKILL.md** to the two-phase orchestration; drop the "no model call" framing; document the grep/Read exploration and the short-but-descriptive description bar.
5. **Update the `drift-reconciler` sub-agent**: add `Read` + `Grep`; describe list → judge-stitch → apply-stitch → judge-describe → apply-descriptions; keep the manual `/drift` path working.
6. **Rewrite tests.** `reconcile_stitch.test.ts` → golden-JSON `--apply-stitch` assertions; drop executor mocks; keep/repoint the describe-cache test to the new persistence path.
7. **Docs.** Update `docs/comprehension/flow-construction.html` and refresh the agentic-stitching companions to the three-mode surface.
<!-- SECTION:PLAN:END -->
