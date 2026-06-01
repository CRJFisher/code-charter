---
id: TASK-27.1.9
title: "Key-control-flow skill B: agent-selected key decisions over one flow (golden-path view)"
status: To Do
assignee: []
created_date: "2026-06-01"
labels:
  - sub-agents
  - skills
  - flowchart
  - flows
  - ui
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.1.4
  - task-27.1.5
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
  - backlog/docs/vision.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

> **The first add-on after v1 ships.** It converts the flow view from "renders the flow" to "renders the **essence** of the flow" for non-trivial flows. High priority — essence _is_ a salience claim, so this is what makes the headline use-case good, not a parked extra.

A **skill** that takes one flow (skill A's output, task-27.1.5) and detects its **key control flow** — the decisions that fork business behaviour and define the golden paths — surfacing _those_ in a legible view and suppressing incidental control flow (guard clauses, trivial null-checks, logging branches).

**The point is selection, not exhaustion.** This is a salience/abstraction step, not a dump of every `if`/`for`. Scoping it to **one flow** (rather than the whole repo) is a strict simplification and a precision gain: skill A supplies the umbrella rationale — the "key _relative to what_" context. The control-flow structure is **agent-inferred** over the existing call graph + source (no ariadne change required; the ariadne add-on, task-27.1.13, only sharpens it). It runs through the same background sub-agent + `agent.inferred` lane as skill A, and renders through the same adapter (shaped nodes: decision/IO/loop; semantic edge labels) — a rendering of the flow, not a separate surface.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 **Key-control-flow selection (the core):** the agent selects and ranks which decisions within a flow are key (golden-path / business-relevant); only the decisions that matter surface within the per-view budget; finer/incidental branches appear on zoom-in. Selection is agentic, overridable content — the user can pin a decision as important or suppress one as noise (watermark ladder). How "key" is judged is **D-KEY-CONTROL-FLOW** (open, now load-bearing)
- [ ] #2 The rendering shows the **key** decision points with labeled branch edges — **not** every branch; functions render as shaped nodes (decision/IO/loop) from a heuristic node-role classifier (the zero-LLM baseline; LLM adds salience + semantics)
- [ ] #3 Control/business-logic structure is **agent-inferred** from the flow's member source + call-graph (no ariadne change required); persisted on the `extractor='agent.inferred'` lane (confidence, `inference_rationale`, click-through); renders visually distinct, user overrides win
- [ ] #4 **A→B contract is clean:** skill A supplies `{umbrella, members, entry/exit, docs, rationale}`; skill B operates strictly _within_ one flow to rank key decisions — the two agentic "importance" passes do not overlap (**D-AB-CONTRACT**)
- [ ] #5 Semantic edge labels (control/data/error) coexist with the inferred-vs-literal styling through the open edge-attribute path (**D-EDGE-LABEL-VS-STYLE**, open)

<!-- AC:END -->

## Open decisions

<!-- SECTION:DECISIONS:BEGIN -->

- **D-KEY-CONTROL-FLOW (the core question) — how is a decision judged "key"?** Options: agent judgement from source + skill-A umbrella context · golden-path tracing (entry→outcome paths; high-traffic branches rank higher) · structural heuristics (fan-in/out, happy-path-vs-error, core-branch-vs-guard) · user pin/suppress · a blend. _Stake:_ the salience filter is the whole point — too inclusive = noise, too exclusive = misses what matters.
- **D-AB-CONTRACT** — A=umbrella+members+docs, B ranks within one flow (recommended) · B may re-scope boundaries · merge into one pass. _Stake:_ keeps B a clean add-on, not a competing detector.
- **D-EDGE-LABEL-VS-STYLE** — orthogonal channels (label=why, style=how-known) · combined vocabulary with collision rules · labels at Flow tier/on selection. _Stake:_ inferred edges are already dashed; data-flow/labels collide on that channel.

<!-- SECTION:DECISIONS:END -->

## Implementation Notes

<!-- Added when work begins. -->
