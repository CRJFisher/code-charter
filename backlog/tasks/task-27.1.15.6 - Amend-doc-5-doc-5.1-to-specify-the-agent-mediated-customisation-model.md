---
id: TASK-27.1.15.6
title: Amend doc-5/doc-5.1 to specify the agent-mediated customisation model
status: Done
assignee: []
created_date: "2026-06-09 21:15"
labels:
  - docs
  - drift
  - flows
dependencies: []
references:
  - task-27.1.15
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
  - task-27.1.7
  - task-27.2
parent_task_id: TASK-27.1.15
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The premise behind the task-27.1.15/27.1.15.1 strips — no diagram layer holds direct human byte-edits; customisation is agent-mediated (the agent authors and re-applies it); flow-layer and description writes are wholesale agentic upserts — is currently recorded only in the task documents. The governing design docs still specify the removed surface:

- doc-5.1 declares the user-preservation machinery and re-attachment bin "Included, fully and first … Deferred: nothing" (line 29) and "a user pin is preserved across every auto-sync and never silently overwritten" (line 41).
- doc-5 (lines 14-16) promises authored content "is held for you to reattach, not dropped".

The spec and the implemented system disagree on a named principle ("Anything you author is always considered"). Amend both docs to describe the current model, in canonical self-contained style (present tense, no removed/previous framing):

- Customisation at every diagram layer is agent-mediated: the agent authors it and re-applies it on sync; no layer stores direct human byte-edits.
- Flow-layer and description writes are unconditional agentic upserts that replace layer and field_ownership wholesale; human-authored inputs that reach the diagram (docstrings, frontmatter) live in the code and are deterministically re-read each sync.

This amendment is load-bearing for downstream design: task-27.1.7 (pins) and 27.2 (edit-driven authority) must specify their customisation as agent-mediated, because anything stored as a user-tier field at the flow or description layer is clobbered by the upsert paths (write_flow at flow_store.ts:74, write_descriptions.ts:59-70, via the full ON CONFLICT replace at sqlite_graph_store.ts:205-225). The docs should state this invariant so those tasks design against it.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 doc-5 and doc-5.1 describe the agent-mediated customisation model with no mention of the re-attachment bin, recall-and-reapply preservation, or user-tier pins at the flow layer.
- [x] #2 The docs state the invariant: flow-layer and description writes are wholesale agentic upserts; persistent customisation is agent-authored and re-applied, never stored as protected user-tier fields at these layers.
- [x] #3 Written in canonical, self-contained style (present tense, no references to removed machinery or the strip).
- [x] #4 task-27.1.7 and task-27.2 are checked against the amended invariant; any contradiction in their descriptions is flagged in their task files.
<!-- AC:END -->

## Implementation Notes

## High-level summary

doc-5 and doc-5.1 now state the invariant the system implements. doc-5's principle "Anything you author is always considered" is restated as "Customisation is agent-mediated at every layer": what you want the diagram to say you express to the agent, which authors it and re-applies it on every sync; no diagram layer stores direct human byte-edits; flow-layer and description writes are wholesale agentic upserts that replace `layer` and `field_ownership`; human-authored inputs that reach the diagram (docstrings, frontmatter) live in the code and are deterministically re-read each sync. doc-5.1's per-principle section mirrors it, names the write funnel (`write_flow`, `write_descriptions`, the store's full ON CONFLICT replace), and states the consequence downstream designs must build against: nothing stored at these layers survives a sync except by being re-applied. The auto-sync section describes the inline re-anchor and on-demand retirement; the authority, first-milestone, scope, and open-decisions sections carry no MCP, SessionStart, bin, or watermark-ladder references.

Tasks 27.1.7 and 27.2 are checked against the invariant (AC#4) and carry an "Invariant flag (task-27.1.15.6)" inside their Description sections: 27.1.7's AC#3 "user overrides win" must be realised as agent-re-applied intent, not a stored user-tier field; 27.2's user-layer re-anchor (AC#4), `user_layer.update`/pin-as-`intent_source` (AC#6, Plan F), `drift.resolve` mirror (Plan C), re-attachment bin (Plan E), and promote-to-`layer='user'` mechanism all presuppose machinery the invariant excludes and need re-design when those tasks are picked up.

