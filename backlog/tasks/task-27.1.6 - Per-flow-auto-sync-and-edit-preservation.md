---
id: TASK-27.1.6
title: "Flow hydration + per-flow auto-sync: build a flow's diagram on first work and keep it in step, preserving your edits"
status: To Do
assignee: []
created_date: "2026-06-01"
labels:
  - consistency
  - graph-db
  - flows
  - sub-agents
  - skills
  - hooks
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.1.1
  - task-27.1.3
  - task-27.1.4
  - task-21.2
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Builds each flow's diagram and keeps it in step with the code — and it is the v1 ship point. This task is the **single `Stop`-hook entry point** for a worked-on flow, doing double duty:

- **HYDRATE** — the worked-on code has no agentic diagram yet, so the entry point detects the flow on demand: it groups deterministic entrypoint seeds into a **functionality umbrella** and attaches docs, emitting a **subgraph-induced** flow (seeds + agent-inferred bridge edges + linked docs; the intra-tree interior stays deterministic) and upgrading task-27.1.3's deterministic stub flow **in place** on the agentic lane. Diagrams are built **lazily and piecemeal** — only the flow whose code you are working on is hydrated, never the whole repo upfront — to minimise token cost.
- **RE-SYNC** — the worked-on flow already has a diagram, so the entry point reconciles it (re-extract → re-induce the affected flow's subgraph → preserve edits → re-render).

Both branches run through the same **`drift-sync` skill** (task-27.1.1 ships its contract + stub; this task implements the body), keyed on whether the worked-on flow already has an agentic diagram. The model is **pure auto-sync, not a review queue**: the diagram **always updates** (it never asks permission), and any **user-authored content** (description, name, pin) on the affected nodes/edges is **recalled and re-applied** so your intent is carried across. A genuine miss — content whose anchor no longer resolves, or a flow split/merge that strands a user-given name — goes to the **re-attachment bin**, recoverable and never auto-pruned.

This is the whole of doc-5's "anything you author is always considered" and "the diagram absorbs drift out-of-band, off your attention and your context," plus "the map fills in where you work." There is **no review apparatus in v1**: no observation/adjudication tables, no `open→triaged→resolved` lifecycle, no cosmetic/intent classifier, no PreCommit gate, no drift inbox. Those are deferred (task-27.1.9 / task-27.1.10) — v1's data layer is strictly the auto-sync + the preservation guarantees the model (task-27.0) already provides.

**Execution model (decided):** the `Stop` hook blocks and emits an instruction; the **main agent launches a registered Claude Code custom sub-agent** (`.claude/agents/drift-reconciler.md`, a custom agent via the Task/Agent mechanism); the sub-agent invokes the `drift-sync` skill (SKILL.md instructions + bundled script) and **returns essentially nothing** to the main session. Context rot is bounded, not zero — the work spends the user's tokens deliberately, keeping them on-radar — and a `stop_hook_active` loop guard plus a "no new drift → no-op" check keep it safe to re-fire. Custom sub-agents are chosen over headless `claude -p` for portability across hosts. Processing is scoped to the files worked on this turn; an already-hydrated flow that drifts out-of-session is flagged by the read-only `SessionStart` banner and re-syncs when its code is next worked on (or via `/drift`). **First e2e target: visualise the flow of a Claude Code skill** — a skill directory (SKILL.md + scripts + references + sub-agents) is a deterministically-bounded flow whose linkages are mostly literal (task-21.2's extractors), so it proves the flow container + persistence + render + selector UX while the subjective grouping judgement is near-zero.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 **Unified `Stop`-hook dispatch (HYDRATE or RE-SYNC):** on the `Stop` hook for the files worked on this turn, for each worked-on flow the entry point determines whether an agentic diagram exists. No diagram → **HYDRATE** (detect + create the flow). Diagram exists → **RE-SYNC** (re-extract changed files via the single `re_extract(file_set, origin)` entry point, re-derive the affected flow's induced subgraph, re-render). Both run **automatically** — always update, never gate on the user
- [ ] #2 **Flow detection (the HYDRATE branch):** the sub-agent groups deterministic entrypoint seeds into functionality umbrellas and attaches docs — emitting **subgraph-induced** flows (seeds + agent-inferred bridge edges + linked docs; intra-tree interior stays deterministic), upgrading task-27.1.3's stub flows **in place** on the agentic lane (`layer='agentic'`, bridges as `kind='agentic.bridge'`, lower `confidence`, `inference_rationale` in the attributes bag — there is no `extractor` field)
- [ ] #3 **First target — a skill's flow:** the sub-agent renders a Claude Code skill directory (task-21.2 corpus) as one flow correctly; the skill-dir boundary is the ground-truth acceptance signal (general-repo essence is judged, not measured, in v1). This requires task-21.2's literal skill extractors to write into the task-27.0 store (the port owned by task-27.1.4 AC#6), not task-21.1's superseded duplicate store
- [ ] #4 **Detection goal is an explicit input argument** (no UI yet), so a later goal selector is an added arg, not a rewrite; v1's goal is "orient in a code-tree" (breadth: the few umbrellas), distinct from the key-control-flow agent's depth goal (task-27.1.7)
- [ ] #5 **Membership resolution:** the flow(s) affected by a changed leaf are computed by re-inducing each flow's subgraph from its stored seeds/bridges/docs (task-27.1.3) — not by an `agentic.contains` tree-walk; a leaf shared by several flows re-syncs all of them that are worked on this turn
- [ ] #6 **User edits are preserved and re-applied:** user-authored fields (description, name, pin) on affected nodes/edges are recalled and carried across via the resolver (task-27.0.3) + the watermark ladder (a `user`-owned field is never overwritten; the row's `layer` is `user` per the task-27.1.2 preservation fix); content following a renamed/moved symbol re-anchors automatically
- [ ] #7 **Re-attachment bin:** when the resolver returns a `miss`, or a flow split/merge strands a user-given name/pin, the affected user content is held in a recoverable re-attachment bin (the user reattaches via `drift.resolve` or deletes); it is never auto-pruned. The bin is a query over preserved-but-unresolved content (task-27.0 soft-delete + resolver miss) — **no new table**
- [ ] #8 **Sub-agent execution:** the `Stop` hook blocks and emits an instruction; the main agent launches the registered custom sub-agent (`.claude/agents/drift-reconciler.md`); the sub-agent persists by invoking the `drift-sync` skill (task-27.1.1 contract, body here) — which writes under `rebuild_layer('agentic')` — not by writing the store directly and not via MCP; it returns ~nothing to the main agent (bounded context rot, no review queue, no blocking). The `stop_hook_active` guard and a "no new drift → no-op" keep it loop-safe; cost/time is bounded; ungrouped entrypoints fall back to singleton stub flows above the cap
- [ ] #9 **Stable identity:** detected flows persist with stable identity (dominant seed-entrypoint anchor, task-27.1.3) so a re-run does not strand user renames/pins; a split/merge surfaces in the re-attachment bin. On each hydrate/re-sync the flow node's `attributes.last_synced_at` is stamped (drives the selector's recency ordering, task-27.1.3 — no schema migration)
- [ ] #10 No `drift_observations` / `drift_adjudications` tables, no triage classifier, no lifecycle states, no PreCommit gate are introduced — these are explicitly deferred to task-27.1.9 / task-27.1.10

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. **`Stop`-hook dispatch → HYDRATE or RE-SYNC:** on the `Stop` hook for the files worked on this turn, for each worked-on flow determine whether an agentic diagram exists (`EXISTS(agentic.flow node)`). No diagram → **HYDRATE** (run flow detection). Diagram exists → **RE-SYNC**: map changed files to affected flows by re-inducing each flow's subgraph from its persisted seeds/bridges/docs (intersect changed `source_file`s with member incidence).
2. **HYDRATE (flow detection):** group deterministic entrypoint seeds into functionality umbrellas, infer `agentic.bridge` cross-call-graph + entrypoint→doc edges, attach docs, and write the subgraph-induced flow on the agentic lane, upgrading task-27.1.3's stub in place. Detection goal is an explicit arg. Model calls run inside the sub-agent's own run.
3. **RE-SYNC via the `drift-sync` skill:** the script calls `re_extract(file_set, origin='code-change')` (task-27.1.2) for the changed files, re-derives the affected flow(s), and re-renders. All store internals are behind the script (task-27.1.1 contract; body implemented here).
4. **Preserve edits:** for each affected node/edge, resolve its anchor (task-27.0.3) and carry user-owned fields across via the watermark ladder; re-anchor content that followed a rename/move.
5. **Re-attachment bin:** surface resolver misses + split/merge-stranded names as a query over preserved-unresolved content; `drift.resolve` reattaches or deletes.
6. **Drive via the `Stop` hook → main agent → custom sub-agent → script:** the hook blocks and emits an instruction; the main agent launches the registered custom sub-agent; the sub-agent invokes the script and returns ~nothing. `stop_hook_active` guards against loops; a turn with no new drift is a no-op. Stamp `attributes.last_synced_at` on each hydrated/re-synced flow.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
