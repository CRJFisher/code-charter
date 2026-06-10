---
id: TASK-27.1.7
title: "Key-control-flow agent: agent-selected key decisions over one flow (golden-path view)"
status: To Do
assignee: []
created_date: "2026-06-01"
labels:
  - sub-agents
  - flowchart
  - flows
  - ui
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.1.4
  - task-27.1.6
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
  - backlog/docs/vision.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

> **The first add-on after v1 ships.** It converts a flow view from "renders the flow" to "renders the **essence** of the flow" — the qualitative half of doc-5's "shows the essence, not everything." High priority: essence _is_ a salience claim, so this is what makes the headline comprehension use-case land.

A **registered Claude Code custom sub-agent** (`.claude/agents/*.md`, not a SKILL.md skill) that takes one flow (the flow-detection agent's output, task-27.1.6) and selects its **key control flow** — the decisions that fork business behaviour and define the golden paths — surfacing _those_ and suppressing incidental control flow (guard clauses, trivial null-checks, logging branches). **Selection, not exhaustion.** Scoping it to one flow is a precision gain: the flow's umbrella rationale is the "key _relative to what_" context.

The structure is **agent-inferred** over the existing call graph + source (no ariadne change required; the ariadne add-on, task-27.1.13, only sharpens it). It runs through the same custom-sub-agent execution path (the Stop hook blocks and instructs the main agent, which launches the registered sub-agent; the sub-agent persists via the `drift-sync` skill and returns ~nothing) + agentic lane (`layer='agentic'`, shaped kinds (`flow.decision`/`cfg.*`), lower `confidence`, `inference_rationale` in the attributes bag — there is no `extractor` field) as the flow hydration / auto-sync sub-agent (task-27.1.6), and renders through the same adapter (shaped nodes: decision/IO/loop; semantic edge labels) — a rendering of the flow, not a separate surface.

<!-- SECTION:DESCRIPTION:END -->

## Invariant flag (task-27.1.15.6)

doc-5/doc-5.1's agent-mediated customisation invariant: flow-layer and description writes are
wholesale agentic upserts that replace `layer` and `field_ownership`; nothing at these layers
survives a sync as a protected user-tier field. AC#1 already specifies selection steering as
agent-mediated. **AC#3's "user overrides win" must be realised the same way** — as agent-recorded
intent re-applied on each pass, not as a stored user-tier field at the flow-chart layer, which the
upsert paths (`write_flow`, `write_descriptions`) would clobber.


## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 **Key-control-flow selection (the core):** the agent selects and ranks which decisions within a flow are key (golden-path / business-relevant); only the decisions that matter surface within the per-view budget; finer/incidental branches appear on zoom-in. Selection is agentic content the user steers **through the agent** — the user instructs the agent to treat a decision as key or as noise, and the agent re-applies that intent on each pass (no direct-edit user tier; customisation at the flow-chart layer is agent-mediated, task-27.1.15). How "key" is judged is **D-KEY-CONTROL-FLOW** (open, load-bearing)
- [ ] #2 The rendering shows the **key** decision points with labeled branch edges — **not** every branch; functions render as shaped nodes (decision/IO/loop) from a heuristic node-role classifier (the zero-LLM baseline; LLM adds salience + semantics)
- [ ] #3 Structure is **agent-inferred** from the flow's member source + call-graph (no ariadne change); persisted on the agentic lane (`layer='agentic'`, shaped kinds (`flow.decision`/`cfg.*`), `confidence`, `inference_rationale` attribute); renders visually distinct, user overrides win
- [ ] #4 **Input contract:** the flow-detection agent supplies `{umbrella, members, entry/exit, docs, rationale}`; this agent operates strictly _within_ one flow to rank key decisions — the two agentic passes do not overlap (**D-AB-CONTRACT**)
- [ ] #5 Semantic edge labels (control/data/error) coexist with the inferred-vs-literal styling through the open edge-attribute path (**D-EDGE-LABEL-VS-STYLE**, open)

<!-- AC:END -->

## Open decisions

<!-- SECTION:DECISIONS:BEGIN -->

- **D-KEY-CONTROL-FLOW (the core) — how is a decision judged "key"?** agent judgement from source + umbrella context · golden-path tracing · structural heuristics (fan-in/out, happy-path-vs-error, core-vs-guard) · agent-applied user intent (the user instructs, the agent re-marks) · a blend. _Stake:_ too inclusive = noise, too exclusive = misses what matters.
- **D-AB-CONTRACT** — detection supplies umbrella+members+docs; this agent ranks within one flow (recommended) vs may re-scope vs merge into one pass.
- **D-EDGE-LABEL-VS-STYLE** — orthogonal channels (label=why, style=how-known) vs combined vocabulary vs labels-on-selection.

<!-- SECTION:DECISIONS:END -->

## Implementation Notes

<!-- Added when work begins. -->
