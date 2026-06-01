---
id: TASK-27.1.4
title: "Agentic substrate: gap-detection, inference, descriptions, and flow grouping"
status: To Do
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

The shared agentic substrate that flow-detection (task-27.1.5) reshapes — not a parallel pipeline. It closes the gaps static analysis can't and produces the raw material flow boundaries are built from. Runs through task-27.1.1's `invoke_agent` (batched, bounded) on the agentic lane — `layer='agentic'`, inferred edges as `kind='agentic.bridge'`, lower `confidence`, `inference_rationale` in the attributes bag. (There is no `extractor` field on rows; the only `extractor_id` is raw-edge provenance.)

This is the re-scoped agentic post-processing pass: its gap-detection results become the **candidate flow seeds** (orphan entrypoints = candidate seeds; disconnected components = candidate separate flows), and its inference + description machinery feeds both the comprehension content and the flow-detection agent's grouping.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 **Cheap gap-detection (deterministic, pre-agent):** orphan entrypoints (no incident doc edge), unresolved call-sites / low out-degree at dynamic-dispatch shapes, disconnected components — bounding agent cost and seeding flow boundaries (orphan entrypoints → candidate flow seeds; disconnected components → candidate separate flows)
- [ ] #2 **Registry-shaped call-edge gap-filling + entrypoint→doc inference** — "registry-shaped" = an explicit string→symbol map in the source (route table, `meta.json sub_agents[]`, listener registry), not arbitrary reflection. Written back as `layer='agentic'`, `kind='agentic.bridge'`, lower `confidence`, `inference_rationale` (attributes bag); an inferred edge's provenance `source_range` is the **registry/entrypoint definition span** that justifies it (so the NOT-NULL `edge_provenance.source_range` is satisfied and click-through lands on real source); render styles them distinct
- [ ] #3 **Deterministic-first descriptions:** Ariadne docstring where present (no LLM call); batched LLM only for the rest; content-hash cached; a hard cap (default 200 LLM-described nodes per run, bounded by task-27.1.1's ceiling) above which the symbol name is the placeholder; stamped agentic-owned (user override wins per the watermark ladder)
- [ ] #4 **Flow-grouping/labelling output:** the pass emits the candidate-seed + bridge material that task-27.1.5's flow-detection agent consumes to assemble flows; the boundary between this deterministic substrate and the agent's subjective grouping is explicit (substrate proposes candidates; the agent judges umbrellas)
- [ ] #5 Runs as a `rebuild_layer('agentic')` writer honoring the preservation invariant (no user-owned field hard-deleted) and a hard cost/time ceiling (task-27.1.1)
- [ ] #6 **task-21.2 → task-27.0 extractor port:** task-21.2's skill-ingestion + literal doc/frontmatter extractors are re-pointed to write into the task-27.0 store as raw-tier rows (so the gap-detection in AC#1 actually has doc edges to find, and the skill-flow target in task-27.1.5 has a corpus). task-21.1's separate/duplicate persistent store is **superseded by task-27.0** and closed — no second store (NO-BACKWARDS-COMPATIBILITY)

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Gap-detection queries over the post-processed graph → bounded work-list + candidate flow seeds.
2. Inference agent via task-27.1.1's `invoke_agent`, batched; write back inferred edges with distinct extractor/confidence/rationale/source_range.
3. Deterministic-first description policy (docstring-first, batched-LLM fallback, cache, cap).
4. Emit the candidate-seed/bridge material for task-27.1.5; pin the substrate↔skill-A contract.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
