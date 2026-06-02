---
id: TASK-27.1.4
title: "Agentic substrate: gap-detection, inference, descriptions, and flow grouping"
status: Done
assignee: []
created_date: "2026-06-01"
labels:
  - ariadne
  - sub-agents
  - extraction
  - flows
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.1.1
  - task-27.1.3
  - task-21.2
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The shared agentic substrate that flow-detection (task-27.1.6) reshapes — not a parallel pipeline. It closes the gaps static analysis can't and produces the raw material flow boundaries are built from. Its model calls (gap inference, description batches) run **inside the flow hydration / auto-sync sub-agent's own run** (task-27.1.6), batched and bounded — not via a separate harness primitive. Writes land on the agentic lane — `layer='agentic'`, inferred edges as `kind='agentic.bridge'`, lower `confidence`, `inference_rationale` in the attributes bag. (There is no `extractor` field on rows; the only `extractor_id` is raw-edge provenance.)

This is the re-scoped agentic post-processing pass: its gap-detection results become the **candidate flow seeds** (orphan entrypoints = candidate seeds; disconnected components = candidate separate flows), and its inference + description machinery feeds both the comprehension content and the flow-detection agent's grouping.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 **Cheap gap-detection (deterministic, part of the skeleton):** orphan entrypoints (no incident doc edge), unresolved call-sites / low out-degree at dynamic-dispatch shapes, disconnected components. This is deterministic and may run whole-repo as part of the browsable skeleton; it seeds candidate flow boundaries (orphan entrypoints → candidate flow seeds; disconnected components → candidate separate flows) that the agentic hydration pass consumes **lazily, per worked-on flow** — not as one eager whole-repo grouping run.
- [ ] #2 **Registry-shaped call-edge gap-filling + entrypoint→doc inference** — "registry-shaped" = an explicit string→symbol map in the source (route table, `meta.json sub_agents[]`, listener registry), not arbitrary reflection. Written back as `layer='agentic'`, `kind='agentic.bridge'`, lower `confidence`, `inference_rationale` (attributes bag); an inferred edge's provenance `source_range` is the **registry/entrypoint definition span** that justifies it (so the NOT-NULL `edge_provenance.source_range` is satisfied and click-through lands on real source); render styles them distinct
- [ ] #3 **Deterministic-first descriptions (per worked-on flow, lazy):** when a flow is hydrated or re-synced (task-27.1.6), its nodes get descriptions scoped to that flow — Ariadne docstring where present (no LLM call); batched LLM only for the rest; content-hash cached; a per-run cap (default 200 LLM-described nodes) above which the symbol name is the placeholder. Description batches run inside the sub-agent's own run (no separate primitive). Stamped agentic-owned (user override wins per the watermark ladder). Descriptions are not generated whole-repo upfront.
- [ ] #4 **Flow-grouping/labelling output:** the pass emits the candidate-seed + bridge material that task-27.1.6's flow-detection agent consumes to assemble flows; the boundary between this deterministic substrate and the agent's subjective grouping is explicit (substrate proposes candidates; the agent judges umbrellas)
- [ ] #5 Runs as a `rebuild_layer('agentic')` writer honoring the preservation invariant (no user-owned field hard-deleted) and a hard cost/time ceiling (task-27.1.1)
- [ ] #6 **task-21.2 → task-27.0 extractor port:** task-21.2's skill-ingestion + literal doc/frontmatter extractors are re-pointed to write into the task-27.0 store as raw-tier rows (so the gap-detection in AC#1 actually has doc edges to find, and the skill-flow target in task-27.1.6 has a corpus). task-21.1's separate/duplicate persistent store is **superseded by task-27.0** and closed — no second store (NO-BACKWARDS-COMPATIBILITY)

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Gap-detection queries over the post-processed graph → bounded work-list + candidate flow seeds.
2. Inference runs inside the hydration sub-agent's own run (task-27.1.6), batched; write back inferred edges on the agentic lane — `layer='agentic'`, `kind='agentic.bridge'`, lower `confidence`, `inference_rationale` (attributes bag), provenance `source_range` = the registry/entrypoint definition span. No `extractor` field; `extractor_id` is raw-edge provenance only.
3. Deterministic-first description policy (docstring-first, batched-LLM fallback, cache, cap).
4. Emit the candidate-seed/bridge material for task-27.1.6; pin the substrate↔flow-hydration-sub-agent contract.

<!-- SECTION:PLAN:END -->

## Implementation Notes

## High-level summary

**Why this exists.** Static call-graph extraction leaves gaps a comprehension map must close: entrypoints with no documentation, call-sites that do not resolve to a single concrete target (dynamic dispatch, registry lookups), and code islands disconnected from any entrypoint. This task builds the deterministic *agentic substrate* that finds those gaps and produces the raw material from which task-27.1.6's flow-detection sub-agent assembles flows. It is not a parallel pipeline: the substrate proposes candidates deterministically, and the sub-agent (task-27.1.6), inside its own run, makes the model calls and judges which candidates become flow "umbrellas."

**Approach.** Everything expensive or subjective belongs to task-27.1.6; this task ships the pure, testable, deterministic halves plus the writer contracts the sub-agent invokes — mirroring how task-27.1.1 shipped the `drift-sync` contract while task-27.1.6 ships its body. The LLM batch executor (description text) and the non-literal half of registry/entrypoint→doc inference are typed injected dependencies (`DescribeBatchExecutor`, the registry detector's `resolve_target`); only a no-op executor ships here. Three deterministic modules operate over the live Ariadne `CallGraph` (the same source `build_skeleton_flows` uses) plus the store's doc edges, and a fourth persists the result on the agentic lane.

**What changed, at altitude.**

- **Gap-detection** (`agentic/gap_detection.ts`): `detect_gaps` finds orphan entrypoints (no incident `code.literal-doc` edge, matched in symbol_path space via `flow_id_of`), unresolved-heavy / dynamic-dispatch shapes (a self-relative unresolved-ratio metric, default ≥ 0.5 over ≥ 2 call sites), and undirected disconnected components, each category bounded with a reported truncation (never a silent cap). `derive_candidate_seeds` turns orphan entrypoints and disconnected components into the candidate flow seeds task-27.1.6 consumes.
- **Registry bridges** (`agentic/bridge.ts` + `agentic/registry_detector.ts`): `detect_meta_json_sub_agent_bridges` resolves a skill's `meta.json sub_agents[]` map into `BridgeCandidate`s; `build_bridge_edges` builds `agentic.bridge` edges at lower confidence carrying `inference_rationale` in the attributes bag and provenance whose `source_range` is the declaration span (NOT-NULL satisfied; click-through lands on real source).
- **Description policy** (`agentic/describe_policy.ts` + `agentic/write_descriptions.ts`): `plan_descriptions` partitions a flow's members into docstring-first (no LLM), content-hash-cached (skipped), LLM-needed (up to a default-200 cap), and over-cap placeholder (the symbol name). Resolved descriptions are written as separate **`agentic.description` side-nodes**, one per code symbol, anchored to `symbol_path:content_hash` and stamped agentic-owned so a user override wins via the watermark ladder.
- **The agentic writer** (`agentic/agentic_writer.ts`): `write_agentic_substrate` persists a `SubstrateProposal` (bridges + descriptions) scoped (no layer nuke), honoring the preservation invariant and a hard cost ceiling (count caps + a coarse deadline gate, every truncation logged).
- **The task-21.2 → task-27.0 extractor port** (`packages/core/src/extractors/`): `ingest_skill` reads a skill directory and writes raw-tier `code.doc` nodes (frontmatter surfaced as attributes) plus `skill.to_script` / `skill.to_reference` / `code.literal-doc` / `skill.to_subagent` edges with span provenance, deduping repeated links to one edge with multiple provenance rows. task-21.1's standalone store never shipped — task-27.0 is the only store.

**Key decisions.** Descriptions live on a separate `agentic.description` node rather than a field on the raw `code.function` node: `invalidate_nodes_for_files` and `rebuild_layer('raw')` delete only `layer='raw'` rows, so the side-node survives a re-parse and re-anchors through `re_extract`'s existing preserved-node reconciliation — no store changes, no shim. The provenance-carrying `build_bridge_edges` replaces `flow.ts`'s thin builder (no external callers). A single `read_sub_agents` reader feeds both the raw `skill.to_subagent` extractor and the agentic registry detector. No `packages/types` surface is added — all new contracts are core-internal over the existing row types.

**How to navigate.** Start at the per-task export blocks in `packages/core/src/index.ts`. The deterministic substrate and writer are under `packages/core/src/agentic/`; the literal extractor port under `packages/core/src/extractors/`, writing through the existing `GraphStore` / `re_extract` seam. The substrate↔27.1.6 assembly chain is documented at the head of `agentic/agentic_writer.ts`: gaps → seeds → registry detector → `build_bridge_edges`; `plan_descriptions` → injected executor → `ResolvedDescription` → write.

**What to watch.** Model calls and subjective umbrella-grouping are task-27.1.6's. The cost ceiling is primarily the count caps; the writer's deadline only gates the (already-resolved) description write, since the model-time budget belongs to 27.1.6's executor. The skill corpus supplies doc-to-doc `code.literal-doc` edges and the skill-flow corpus; orphan-detection over *code* entrypoints additionally needs code→doc literal edges from a future code-doc extractor. A persisted bridge endpoint is a NodeRow id, so 27.1.6 maps it back to a `SymbolId` before feeding `induce_members`.

<!-- Added when work begins. -->
