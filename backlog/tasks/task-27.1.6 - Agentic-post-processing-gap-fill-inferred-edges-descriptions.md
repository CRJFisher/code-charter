---
id: TASK-27.1.6
title: "Agentic post-processing: gap-fill, inferred edges, deterministic-first descriptions"
status: To Do
assignee: []
created_date: "2026-05-31"
labels:
  - ariadne
  - sub-agents
  - extraction
  - mcp
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.1.1
  - task-27.1.3
  - task-21.2
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The batch, run-when-asked agentic pass that closes the gaps static analysis can't, so the map is connected end to end, and that gives every node a behaviour description so a level reads as a story about behaviour. It runs as `rebuild_layer('agentic')` through task-27.1.1's invocation harness and must honor the preservation invariant established in task-27.1.2 (no user-owned field is ever hard-deleted by the rebuild).

v1 restricts the agent to the highest payoff-to-cost gaps — registry-shaped call edges and entrypoint→doc links — and uses a **deterministic-first** description policy so cost is bounded to nodes that lack a docstring rather than O(all nodes). Harder dynamic-dispatch resolution is left as visible dead-ends (deferred ideal).

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 **Gap detection (cheap, deterministic, pre-agent):** queries find entrypoints with no incident doc edge, unresolved call-sites / low out-degree at dynamic-dispatch shapes, and disconnected components — scoping the agent so cost is bounded
- [ ] #2 **Registry-shaped call-edge gap-filling + entrypoint→doc inference:** the agent reads explicit string→symbol maps (route tables, `meta.json sub_agents[]`, listener registries) and ranked candidate docs, emitting resolved edges written back with `extractor='agent.inferred'`, lower `confidence`, an `inference_rationale`, and `edge_provenance.source_range` for click-through; render styles them dashed/tinted
- [ ] #3 **Deterministic-first descriptions:** for any node where Ariadne provides a docstring (`get_docstring`), that docstring is the description with **no LLM call**; the LLM is invoked only for nodes lacking one, batched per-cluster with call-graph context, content-hash cached; a hard cap (default 200 LLM-only nodes/run) applies, above which the symbol name is the placeholder and the node is flagged for deferred enrichment. Generated descriptions are stamped agentic-owned (user override wins, per the ladder)
- [ ] #4 The pass runs as `rebuild_layer('agentic')` via task-27.1.1's harness and **honors the preservation invariant**: no user-owned field (leaf or cluster) is hard-deleted (task-27.1.2 / task-27.1.3); a hard cost/time ceiling is enforced
- [ ] #5 Doc-node inference (entrypoint→doc) is gated behind task-21.2's doc-node extraction; absent it, the pass runs on code nodes only without failing

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. **Gap-detection queries** over the post-processed graph (orphan entrypoints, low-out-degree dynamic dispatch, disconnected components) to produce the bounded agent work-list.
2. **Inference agent** via task-27.1.1's `invoke_agent`, batched; write back inferred edges with the distinct `extractor`/`confidence`/`inference_rationale`/`source_range`.
3. **Description policy:** docstring-first (no LLM), batched LLM fallback per cluster, content-hash cache, hard cap + placeholder; stamp agentic-owned.
4. Wire the whole pass as the `rebuild_layer('agentic')` writer; rely on the task-27.1.2 ladder/identity for preservation.
5. Tests: gap-detection precision; inferred-edge provenance + style; docstring path makes no LLM call; cap → placeholder; user-owned description/label survives the pass.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
