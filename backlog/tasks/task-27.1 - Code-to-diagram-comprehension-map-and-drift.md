---
id: TASK-27.1
title: "Code to diagram: flow comprehension and drift"
status: To Do
assignee: []
created_date: "2026-05-29"
labels:
  - architecture
  - ariadne
  - graph-db
  - mcp
  - hooks
  - sub-agents
  - ui
  - consistency
  - flows
dependencies:
  - task-27
  - task-27.0
  - task-27.0.1
  - task-21.2
parent_task_id: TASK-27
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The code→diagram half of the Diagram-Driven Development capstone: building the comprehension diagram from the code, and keeping it honest as code changes.

**The v1 unit is a _flow_.** A flow is an agent-detected **functionality umbrella** that links one or more Ariadne call-graphs together with documentation. v1 surfaces flows as a **left-panel selector** (replacing the current entrypoint list); selecting a flow renders it as its own connected diagram. The dominant use-case v1 serves is **quickly understanding the essence of a code-tree**. This is a deliberate v1 scoping of doc-5's "the whole repo is one zoomable map": a flow is the **tiling block** of that map, surfaced one-at-a-time first; the global zoomable map is the post-v1 composition of flows (task-27.1.12), not abandoned.

The organizing axis is the **seam** task-27.0 already drew by cost-of-regeneration: **deterministic** substrate (Ariadne call/import edges, the function→file→directory scaffold, literal doc/frontmatter edges, entrypoint roots — free, objective) vs **agent-detected** structure (the flow boundary, its label, bridge edges across call-graphs, doc attachment, and later the salience of key control flow — expensive, subjective, goal-dependent). The agent-detected layer is the L1 agentic tier; v1 fixes one detection goal ("essence of a code-tree") so the work is specifiable.

Builds on the shared custom graph model (task-27.0): the layering, the preservation guarantees, and the anchor resolver. The keeping-in-sync job is a **diff signal scoped to a flow's membership**: when a flow's code/docs change, detect it and reconcile **out-of-band** via a background sub-agent so the developer's session is never interrupted. The diagram→code direction is task-27.2.

The diagram here is **read-only for authoring**: it presents flows and surfaces drift for review (accept / dismiss / reattach); the user does not restructure it. The one layout mutation is node positioning (task-22). All authoring edits live in task-27.2; the seam invariants that keep task-27.2 purely additive are in section G.

<!-- SECTION:DESCRIPTION:END -->

## Decomposition into sub-tasks

<!-- SECTION:DECOMPOSITION:BEGIN -->

Thirteen sub-tasks, numbered in **completion order** (every dependency points to a lower number). The **v1 critical path** is `27.1.1 → 27.1.2 → 27.1.3 → 27.1.4 → 27.1.5 → 27.1.6`; v1 ships there. 27.1.9 (key-control-flow) is the first add-on; 27.1.10–27.1.13 are follow-ups / deferred.

| Sub-task | Pri | Scope | Depends on |
| -------- | --- | ----- | ---------- |
| **27.1.1** | high | **Infra substrate** — `drift` MCP server (`drift.resolve`/`drift.list`, audited); single named agent-invocation entry point supporting **fire-and-forget background sub-agents** (write via tools, return nothing — no context rot); `.claude` hook installer (host-keyed install target) + degradation matrix. | task-27.0 |
| **27.1.2** | high | **Preservation fix + adapter + rename milestone** — `write_fields` promotes row `layer` to `user`; single `re_extract(file_set, origin)`; `CustomGraph`→React Flow adapter rendering **one bounded subgraph**; position-preserving `apply_hierarchical_layout`; file/dir GROUP-BY scaffold; the doc-5 rename milestone (leaf-only). | 27.1.1 |
| **27.1.3** | high | **Flow entity + stub flows + selector UI + per-flow render** — `agentic.flow` group node (subgraph-induced membership) with stable identity; deterministic stub flow set; left-panel flow selector **replacing entrypoints**; auto-select & render the top-ranked flow. | 27.1.2 |
| **27.1.4** | high | **Agentic substrate** — gap-detection (seeds flow boundaries), registry-shaped + entrypoint→doc inference on the `agent.inferred` lane, deterministic-first descriptions; emits the candidate-seed/bridge material skill A consumes. | 27.1.1, 27.1.3 |
| **27.1.5** | high | **Flow-detection skill A** (critical path) — a SKILL that links call-graphs + docs under a functionality umbrella, upgrading the stub flows in place; **first target = visualise a skill's flow** (task-21.2 corpus); runs as a **background sub-agent** (hook-triggered, updates via tools, returns nothing). | 27.1.3, 27.1.4, task-21.2 |
| **27.1.6** | high | **Per-flow drift engine** — two-phase verify-then-update diff scoped to flow membership; `drift_observations`/`drift_adjudications` tables; leaf→flow up-propagation; re-attachment bin (extended to flow split/merge). **[v1 SHIPS HERE]** | 27.1.1, 27.1.3 |
| **27.1.7** | medium | **Drift triage sub-agent** (per-flow) + cosmetic/intent classifier decision table + the typed generic `TriageSubject`/`TriageVerdict` contract (task-27.2 reuses unchanged). | 27.1.1, 27.1.6 |
| **27.1.8** | medium | **Delivery surfaces + PreCommit git gate** (fires only for still-open structural/intent drift touching staged files) + change-scoped comprehension summary. | 27.1.6, 27.1.7 |
| **27.1.9** | high | **Key-control-flow skill B** (the first add-on) — over ONE flow, select & rank the **key** decisions (golden paths), suppress incidental control flow; shaped nodes + semantic edge labels; agent-inferred, not ariadne-gated. | 27.1.4, 27.1.5 |
| **27.1.10** | medium | _(folded from task-21)_ **Portable skill-bundle distribution** — second-host (Cursor) parity for the skill bundles without translation code. | 27.1.1, 27.1.5, 27.1.6 |
| **27.1.11** | low | _(deferred)_ **Clustering as a flow-chunking input + task-27.2 refactoring signal** — the former clustering core, demoted to an optional input behind the file/dir scaffold + call-graph topology. | 27.1.9 |
| **27.1.12** | low | _(deferred)_ **Whole-repo zoomable map** — the post-v1 composition of flows over the file/dir scaffold with N-tier budget zoom; realizes doc-5's "one zoomable map". | 27.1.3, 27.1.11 |
| **27.1.13** | low | _(deferred, ariadne repo)_ **Ariadne precision add-on** — `block_kind`/`condition_text`/`argument_texts`; sharpens skill B at higher confidence; gates nothing. | — (upstream) |

<!-- SECTION:DECOMPOSITION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 The webview presents a **left-panel flow selector** that replaces the entrypoint list; each flow is an agent-detected functionality umbrella (subgraph-induced: seed entrypoints + bridge edges + linked docs) rendered as its own connected diagram; on open, the top-ranked flow is auto-selected and rendered
- [ ] #2 Every node carries a human-readable description — a deterministic docstring where present, an agentic default otherwise, overridable by the user (watermark wins)
- [ ] #3 Agent-inferred links (cross-call-graph bridges, inferred entrypoint→doc) render visually distinct from literal-extracted edges and are click-through-explained; accept/reject is persisted and never re-proposed
- [ ] #4 A flow's diagram re-renders when its code/docs change (out-of-band, not necessarily instantly)
- [ ] #5 Per-flow code→diagram drift is detected on code/doc change and surfaced **without blocking the editing session** — inserted as an observation row, scoped by flow membership
- [ ] #6 Drift items move through `open → triaged → resolved | dismissed | auto-archived`; a dismissed item is not re-surfaced
- [ ] #7 The single intentional blocking interruption is a PreCommit gate that fires only for still-open structural/intent drift touching files in the commit — never for cosmetic, never for already-resolved/dismissed drift
- [ ] #8 Code→diagram resolution is exposed as a named, auditable MCP write (`drift.resolve`); agent-callable and inspectable
- [ ] #9 A customization that fails the resolver, or a flow split/merge that strands a user-given name/pin, is surfaced in a recoverable re-attachment bin — never silently auto-pruned (the preservation guarantee itself is task-27.0)
- [ ] #10 First milestone: a renamed script is reported as one drifted node on session open; accepting carries the hand-written description across, untouched — validated first on a skill's flow (code + docs colocated)
- [ ] #11 Diagram maintenance (flow detection, drift reconciliation) runs as a **background sub-agent**: hook-triggered, updates the diagram via MCP tool calls, returns nothing to the main session (no context rot); the user continues uninterrupted
- [ ] #12 The architecture honors task-27.0's reservations and the section-G seams, so task-27.2 (diagram→code) **and** the deferred whole-repo map (task-27.1.12) are additive — no schema migration, no `render()` signature change, no sub-agent redesign, no layout-entry-point refactor

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

Detail lives in the sub-tasks; this fixes the cross-cutting shape.

### A. The flow as the v1 unit (task-27.1.3, task-27.1.5)

The left-panel **flow selector replaces entrypoints**. A flow = the subgraph **induced** by `{seed entrypoint roots} + {agent-inferred bridge edges across those trees} + {linked docs}` (decided: subgraph-induced, so the agent judges only the seam — cross-tree linkage and doc attachment — while the deterministic call-graph fills each tree's interior). It persists as an `agentic.flow` group node + `agentic.contains`/`agentic.inferred` edges, riding task-27.0's open `kind`/attributes with no schema change. A **deterministic stub flow set** (one flow per entrypoint's reachable call-graph) ships the selector + render *before* the agent lands; **flow-detection skill A** upgrades the stubs in place. On open, the **top-ranked flow auto-renders** (the decided landing view). The **first end-to-end target is a Claude Code skill's flow** — a deterministically-bounded flow (task-21.2's extractors) where the agent's judgement is near-zero — proving the entity + UX + render before arbitrary-repo detection.

### B. The deterministic/agentic seam + background-sub-agent execution (task-27.1.4, task-27.1.5)

Flow detection and key-control-flow are agentic-tier work on the `extractor='agent.inferred'` lane (lower confidence, `inference_rationale`, click-through). **Execution model (decided):** a host hook detects a stale flow and emits a "spawn sub-agent X as a background task" instruction; the sub-agent does the work, **updates the diagram via MCP tool calls, and returns nothing to the main session** — the diagram self-heals out-of-band, the session's context stays clean, the user is uninterrupted. This is doc-5 section-E's "spawned, not inline" pattern as the canonical diagram-maintenance model.

### C. Per-flow drift (the diff signal) (task-27.1.6)

When a flow's code/docs change, re-resolve affected anchors through task-27.0's resolver and diff against the stored graph; a flow's **membership is the proximity boundary** (replacing repo-wide hop-distance). Two-phase verify-then-update; leaf→flow up-propagation over `agentic.contains`; preserved `drift_observations`/`drift_adjudications` tables; adjudications as user-layer rows so a dismissed item never re-surfaces; re-attachment bin extended to flow split/merge.

### D. Surfacing + triage (task-27.1.7, task-27.1.8)

Hook→surface map (`SessionStart` banner, `UserPromptSubmit` nudge, `/drift` walkthrough, `PostToolUse`/`Stop` fire the engine); graceful degradation where a host lacks a primitive (MCP pull is the universal read fallback). The single deliberate block is the **PreCommit git gate** for still-open structural/intent drift. Triage is the out-of-band sub-agent with the cosmetic/intent classifier and the **typed generic `TriageSubject`/`TriageVerdict`** contract task-27.2 reuses.

### E. Key-control-flow (task-27.1.9 — first add-on)

Over one flow, the agent selects and ranks the **key** decisions (golden paths) and suppresses incidental control flow — *selection, not exhaustion*. This converts v1 from "renders the flow" to "renders the essence of the flow." Agent-inferred over the existing call graph + source; **not** gated on the ariadne add-on (task-27.1.13).

### F. Forward-compatibility seams (keeping task-27.2 and the deferred map additive)

The model-level reservations live in task-27.0 (open `origin`/`intent_source`, per-table preserved/disposable tag, the resolver's full state tuple, the open ordered render-layer list, the named-write/audit path). Local seams:

- **Re-extraction is a single named in-process entry point taking `(file_set, origin)`** — host hooks call it `origin=code-change`; task-27.2's apply calls it `origin=apply`; no refactor.
- **`apply_hierarchical_layout` honors caller-supplied fixed positions** (landed in task-27.1.2) so task-27.2 supplies before-positions for stable diffs.
- **Provenance click-through is driven off React Flow selection state**, leaving selection a fan-out signal a later review mode subscribes to.
- **`kind` stays open everywhere** — flow / CFG / data-flow content lands as new namespaced kinds (`agentic.flow`, `cfg.block`, `flow.decision`, `data.flow`) + attributes-bag fields, never a schema column or `ALTER`; the open render-layer list reserves a data-flow layer slot.
- **The render/level-projection seam is generic** — the per-flow render is one containment-source view, so the deferred whole-repo map (task-27.1.12) and key-control-flow (task-27.1.9) plug into the same `render()` without a signature change or a parallel render stack.
- **The hook installer abstracts its install target** behind a host-keyed layout so cross-tool portability (task-27.1.10) adds a layout entry, not a refactor.

### G. Deferred (post-v1)

The **whole-repo zoomable map** (task-27.1.12, composing flows over the file/dir scaffold with N-tier budget zoom), **semantic clustering** (task-27.1.11, demoted to a flow-chunking input + a task-27.2 refactoring signal), and the **ariadne precision add-on** (task-27.1.13) are out of v1 scope. v1 renders one bounded flow at a time, folded only by the deterministic file/dir scaffold within a per-view legibility budget.

<!-- SECTION:PLAN:END -->

## Implementation Notes

### Inherited decision: keep a user-promoted field alive across an agentic rebuild (from task-27.0.2 review)

The store keeps a row's structural `layer` and its per-field `field_ownership` on independent axes; `write_fields` promotes ownership but not `layer`, so a user-owned field can sit on a `layer='agentic'` row, and `rebuild_layer('agentic')` (the agentic pass) would **hard-delete** it whenever the rebuild writer does not re-emit that id — contradicting task-27.0's "agentic/user content is never hard-deleted."

**Decision (resolved):** **`write_fields` promotes the row's structural `layer` to `user` whenever it stamps a field user-owned**, so the row vacates the rebuild-eligible layer. Rejected: "re-emit kept rows" (fragile for non-deterministic agentic ids) and "ownership-aware guard in `rebuild_layer`" (contradicts task-27.0.2 AC#3). Impact: changes the task-27.0.1 `write_fields` contract docstring and touches task-27.0.4 `render()` layer semantics (cosmetic). It **lands as a prerequisite in task-27.1.2**, before any agentic pass can trigger the data-loss path.

### Decision: the deterministic/agentic seam and the flow as the v1 unit

v1's comprehension unit is a **flow** (agent-detected functionality umbrella), not a whole-repo map. The deterministic substrate (call-graphs, file/dir scaffold, literal doc edges) is L0 raw; the flow boundary/label/bridges and key-control-flow salience are L1 agentic. The whole-repo "one zoomable map" is deferred (task-27.1.12) and built by composing flows — a flow is the same containment primitive the map needs, surfaced one-at-a-time first, so this is a stepping-stone, not a divergence. Semantic clustering, once proposed as the map's organizer, is demoted to an optional **input** to chunking a complex flow (task-27.1.11) behind the deterministic file/dir scaffold + call-graph topology, plus a refactoring signal for task-27.2.

### doc-5 alignment

doc-5's "The whole repo is one zoomable map" remains the north-star vision. v1 surfaces flows one-at-a-time via the selector as the path toward it; doc-5 should carry a v1-scope annotation framing flows as the map's tiling blocks (form of the annotation is **D-DOC5-FORM**, open). The whole-repo map returns in task-27.1.12.

### Provenance of the plan revisions

The decomposition and the decisions above were produced by successive multi-agent investigations: a 30-agent gap review (the spine, the preservation fix, the typed triage contract, the PreCommit-as-git-hook correction); a fold of task-20 (business-logic flowcharts) and task-21 (portable doc-code linkage); a re-prioritization that moved semantic clustering off the critical path in favour of the deterministic scaffold + key-control-flow; and a **flow-centric v1 reframe** (this structure) — validated by a 5-agent critique that confirmed flows are the map's tiling blocks (stepping-stone, not divergence), mapped the deterministic/agentic seam onto task-27.0's raw/agentic split, and surfaced the stub-flows-first sequencing that de-risks the agentic bet. Resolved by the maintainer: flow membership is **subgraph-induced**; the landing view **auto-selects the top-ranked flow**; the **skill diagram is the first e2e target**; diagram maintenance runs as a **background sub-agent that returns nothing** (no context rot). Open decisions are recorded in the relevant sub-tasks (flow-list legibility, large-flow render, flow identity, A↔B contract, key-control-flow salience, clustering trigger, doc-5 form, sub-agent trigger, ariadne ownership/split).

<!-- Added when work begins. -->
