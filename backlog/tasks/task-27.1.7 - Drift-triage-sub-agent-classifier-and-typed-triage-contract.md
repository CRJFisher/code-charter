---
id: TASK-27.1.7
title: "Drift triage sub-agent, cosmetic/intent classifier, and typed triage contract"
status: To Do
assignee: []
created_date: "2026-05-31"
labels:
  - sub-agents
  - consistency
  - mcp
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.1.1
  - task-27.1.6
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Out-of-band drift reconciliation, so the main agent keeps working. When the diff signal (task-27.1.6) fires, reconciliation is handed to a spawned triage sub-agent that classifies blast radius and staleness without blocking the session. This task also pins the **typed generic triage contract** that makes task-27.2's actionability assessment a pure reuse — the single most important forward-compatibility seam local to this task.

The classifier's cosmetic / intent / structural / fuzzy decision is what AC#7's PreCommit gate (task-27.1.8) fires on, so its boundary must be deterministic where possible and explicitly testable.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 The triage sub-agent is **spawned, not inline** (a Sonnet sub-agent via task-27.1.1's harness), so the main session is not blocked; topology is per-flow workers + a merging orchestrator, keeping each agent's context small
- [ ] #2 A **cosmetic/intent classifier** is expressed as a decision table over the resolver verdict + edge-diff: `relocated` → intent; edge add/remove → structural; `body-changed` on a prose description field → cosmetic; `body-changed` on a function body/signature → structural; `miss` (simultaneous rename + body-change) → fuzzy/escalate. The deterministic arms are named (no LLM); only the fuzzy arm invokes the sub-agent; the agent never auto-edits source
- [ ] #3 A typed **`TriageSubject`** `{ anchor, before_state: CodeState, proposed_after_state, rationale? }` and **`TriageVerdict`** `{ classification: cosmetic | intent | fuzzy | actionable | diagram-only, blast_radius, staleness, rationale }` are exported from `@code-charter/types` — not an inline prose schema
- [ ] #4 The `diagram.propose` → `TriageSubject` mapping is documented (`before_state = resolve(op.target_anchor)`, `proposed_after_state = {[op.kind]: op.new_value}`, `anchor = op.target_anchor`) so task-27.2 reuses the identical interface without redesign; the verdict union covers both task-27.1's (cosmetic/intent/fuzzy) and task-27.2's (actionable/diagram-only) consumers
- [ ] #5 Triage moves drift items through `triaged` and reports staleness; a verifier/calibrator pass can confirm a staleness claim before it is acted on

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Define `TriageSubject`/`TriageVerdict` in `packages/types/src/triage.ts`, re-exported from `@code-charter/core`/`@code-charter/types`.
2. Implement the deterministic classifier decision table from resolver verdict + edge-diff; route only the fuzzy arm to the sub-agent.
3. Spawn per-flow triage workers via task-27.1.1's `invoke_agent`; merge with an orchestrator; report verdicts back to task-27.1.6's drift rows (move to `triaged`).
4. Document and test the `diagram.propose` → `TriageSubject` mapping (the task-27.2 reuse seam).
5. Tests: classifier matrix per verdict×field; fuzzy-only LLM invocation; subject/verdict round-trip; the 27.2 mapping produces a valid subject; no source auto-edit.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
