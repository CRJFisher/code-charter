---
id: TASK-27.1.5
title: "Flow-detection skill A: link call-graphs + docs under a functionality umbrella (background sub-agent)"
status: To Do
assignee: []
created_date: "2026-06-01"
labels:
  - sub-agents
  - skills
  - flows
  - hooks
  - mcp
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.1.3
  - task-27.1.4
  - task-21.2
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The critical-path agent work: a **skill** that detects linkages beyond Ariadne's call-graphs — linking multiple call-graphs **and** documentation together under a **functionality umbrella** — upgrading task-27.1.3's deterministic stub flows in place into agent-detected flows. This is what turns "one flow per entrypoint" into "the few umbrellas that convey the essence of the code-tree."

**First e2e target: visualise the flow of a Claude Code skill.** A skill directory (SKILL.md + scripts + references + sub-agents) is a _deterministically-bounded_ flow — its umbrella is the directory and its linkages are mostly literal (task-21.2's extractors) — so it proves the flow container + persistence + render + selector UX while the subjective grouping judgement is near-zero. Arbitrary-repo flow detection is the generalization that swaps in the agentic boundary detector over the same entity/UX/render. task-21.2's skill corpus is the first proving ground.

**Execution model (decided — background sub-agent, no context rot):** a host hook (`FileChanged`/`Stop`/`PostToolUse`) detects a flow is stale and emits an instruction to spawn this work as a **background task**, without interrupting the user. The sub-agent runs out-of-band, **updates the diagram directly via MCP tool calls**, and **returns nothing to the main session** — so the main session's context stays clean and the user continues uninterrupted. This is doc-5 section-E's "spawned, not inline" pattern as the canonical diagram-maintenance model.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A **skill** (SKILL.md + scripts + sub-agent defs) groups deterministic entrypoint seeds into functionality umbrellas and attaches docs — emitting **subgraph-induced** flows (seeds + agent-inferred bridge edges + linked docs; intra-tree interior stays deterministic), upgrading task-27.1.3's stub flows **in place** on the `extractor='agent.inferred'` lane
- [ ] #2 **First target — a skill's flow:** the skill renders a Claude Code skill directory (task-21.2 corpus) as one flow correctly; the skill-dir boundary is the ground-truth acceptance signal (general-repo essence is judged, not measured, in v1 — stated explicitly)
- [ ] #3 The detection **goal is an explicit input argument** (no UI yet), so a later goal selector is an added arg, not a rewrite; v1's goal is "essence of a code-tree" (breadth: the few umbrellas), distinct from skill B's depth goal
- [ ] #4 **Background sub-agent execution:** the work is spawned out-of-band from a host hook, updates the diagram via MCP tool calls, and returns nothing to the main session (no context rot); the user is not interrupted. Cost/time bounded by task-27.1.1's ceiling; ungrouped entrypoints fall back to singleton stub flows above the cap
- [ ] #5 Detected flows persist with stable identity (task-27.1.3) so a re-run does not strand user renames/pins; a split/merge surfaces in the re-attachment bin (task-27.1.6)

<!-- AC:END -->

## Open decisions

<!-- SECTION:DECISIONS:BEGIN -->

- **D-SUBAGENT-TRIGGER — does the harness auto-spawn the background sub-agent, or does the hook's message ask the main agent to spawn it?** _Stake:_ the "return nothing / no context rot" goal argues for auto-spawn (the main agent never sees the work); asking the main agent to spawn re-introduces a turn in its context. Lead: auto-spawn via task-27.1.1's harness.
- **D-21.2-RELATIONSHIP — 21.2 as dependency vs first instance.** Decided lean: the skill diagram is the **first e2e target** and proving corpus; task-21.2 provides skill ingestion + literal extractors, and this skill is the generalization. Pin where the flow artifact is first defined (here, task-27.1.3) to avoid duplicating assembly logic in 21.2.
- **D-SKILLA-GOAL — goal as a single fixed v1 value vs an explicit arg** (lead: explicit arg from day one, no UI).

<!-- SECTION:DECISIONS:END -->

## Implementation Notes

<!-- Added when work begins. -->
