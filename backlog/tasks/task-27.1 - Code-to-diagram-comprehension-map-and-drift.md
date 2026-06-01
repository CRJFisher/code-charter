---
id: TASK-27.1
title: "Code to diagram: flow comprehension and auto-sync"
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
  - backlog/docs/doc-5.1 - Diagram-Driven-Development-v1-Manifestation.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The code→diagram half of Diagram-Driven Development: building the comprehension diagram from the code, and keeping it in step as the code changes.

**The v1 unit is a _flow_** — an agent-detected **functionality umbrella** linking one or more Ariadne call-graphs together with documentation. v1 surfaces flows as a **left-panel selector** (replacing the entrypoint list); selecting a flow renders it as its own connected diagram. The v1 goal is **quickly understanding the essence of a code-tree**. This is a deliberate v1 scoping of doc-5's "one zoomable map": a flow is the **tiling block** of that map, surfaced one-at-a-time first; the global map is the post-v1 composition of flows (task-27.1.12).

The organizing axis is task-27.0's cost-of-regeneration **seam**: **deterministic** substrate (Ariadne call/import edges, the function→file→directory scaffold, literal doc edges, entrypoint roots — L0 raw) vs **agent-detected** structure (the flow boundary, label, bridge edges, doc attachment, and later key-control-flow salience — L1 agentic, judgement about what matters).

Keeping in sync is **pure auto-sync, not a review queue**: when a flow's code/docs change, the diagram **always re-syncs** out-of-band via a background sub-agent, and any user-authored content (description, name, pin) is recalled and carried across — the user is never interrupted. The diagram is **read-only for authoring** (the one mutation is node positioning, task-22); all authoring is task-27.2. The seam invariants that keep task-27.2 and the deferred whole-repo map additive are in section F.

<!-- SECTION:DESCRIPTION:END -->

## Glossary (pin against the shipped task-27.0 contract)

<!-- SECTION:GLOSSARY:BEGIN -->

- **The agentic lane** = `layer='agentic'` + a namespaced `kind` + `confidence` (lower than raw) + `inference_rationale` in the attributes bag. There is **no `extractor` field** on `NodeRow`/`EdgeRow`; the only `extractor_id` is raw-edge provenance. "Inferred edge" is not a separate column — it is `layer='agentic'` + the right `kind`.
- **Open kinds used by this task** (all ride task-27.0's open `kind`, no schema migration): `agentic.flow` (a flow group node), `agentic.flow_member` (flow → its seed roots + docs), `agentic.bridge` (an inferred cross-call-graph or entrypoint→doc link). The deterministic file-module grouping (task-27.1.2) uses its **own raw-tier kind** — `agentic.contains` is not overloaded across the two.
- **New preserved table** = add `CREATE TABLE … IF NOT EXISTS` to `CREATE_SCHEMA_SQL` + a `TABLE_REGISTRY_SEED` entry (`disposable:false`); `initialize_schema` creates it on every open with no version bump and no `ALTER`. (A registry row alone does **not** create a table.)

<!-- SECTION:GLOSSARY:END -->

## Decomposition into sub-tasks

<!-- SECTION:DECOMPOSITION:BEGIN -->

Thirteen sub-tasks, completion-order numbered (deps point to lower numbers). The **v1 critical path is `27.1.1 → 27.1.2 → 27.1.3 → 27.1.4 → 27.1.5 → 27.1.6`; v1 ships at 27.1.6.** 27.1.7 (key-control-flow) is the first add-on; 27.1.8–27.1.13 are follow-ups / deferred. The leaner v1 deliberately omits any drift review apparatus (no triage classifier, no lifecycle/observation tables, no PreCommit gate) — those are deferred to 27.1.9 / 27.1.10.

| Sub-task | Pri | Scope | Depends on |
| -------- | --- | ----- | ---------- |
| **27.1.1** | high | Infra substrate — `drift` MCP server (`drift.resolve`/`drift.list`, user-facing only); a two-primitive harness (`invoke_agent` synchronous-returns-a-result; `spawn_background` detached-writes-store-returns-nothing); `.claude` hook installer (host-keyed install target) + degradation matrix. | task-27.0 |
| **27.1.2** | high | Preservation fix (layer-promotion in both `write_fields` wrappers) + `re_extract(file_set, origin)` + `CustomGraph`→React Flow adapter (one bounded subgraph) + position-preserving `apply_hierarchical_layout` + file-module scaffold + rename milestone. | 27.1.1 |
| **27.1.3** | high | Flow entity (`agentic.flow`, subgraph-induced, dominant-seed-anchor identity) + deterministic stub flows + selector UI (replaces entrypoints) + per-flow render + `unattributed` catch-all flow + capped/ranked list + per-view budget. | 27.1.2 |
| **27.1.4** | high | Agentic substrate — gap-detection (seeds flow boundaries), `agentic.bridge` + entrypoint→doc inference, deterministic-first descriptions; the task-21.2→27.0 extractor port (closes task-21.1's duplicate store). | 27.1.1, 27.1.3, task-21.2 |
| **27.1.5** | high | Flow-detection **custom background sub-agent** (subgraph-induced; first target = a skill's flow; writes the store directly, returns nothing). | 27.1.3, 27.1.4, task-21.2 |
| **27.1.6** | high | **Per-flow auto-sync** — always re-sync the affected flow on change + recall/preserve user edits + re-attachment bin. No tables, no lifecycle, no triage, no gate. **[v1 SHIPS HERE]** | 27.1.1, 27.1.3 |
| **27.1.7** | high | _(first add-on)_ Key-control-flow **custom agent** over one flow — select & rank the **key** decisions (golden paths), suppress incidental control flow; shaped nodes + edge labels; agent-inferred, not ariadne-gated. Delivers the qualitative half of "essence, not everything". | 27.1.4, 27.1.5 |
| **27.1.8** | medium | _(folded from task-21)_ Portable skill-bundle distribution — second-host (Cursor) parity without translation code. | 27.1.1, 27.1.5, 27.1.6 |
| **27.1.9** | low | _(deferred, post-v1)_ Drift triage classifier + typed `TriageSubject`/`TriageVerdict` contract (reused by task-27.2). v1 auto-sync needs no classification; this is the review/escalation layer. | 27.1.1, 27.1.6 |
| **27.1.10** | low | _(deferred, post-v1)_ Drift review surfaces + the single PreCommit git gate + change summary — the "surface drift for review" apparatus v1's auto-sync omits. | 27.1.6, 27.1.9 |
| **27.1.11** | low | _(deferred)_ Clustering as a flow-chunking input + task-27.2 refactoring signal. | 27.1.7 |
| **27.1.12** | low | _(deferred)_ Whole-repo zoomable map = composition of flows over the file/dir scaffold; realizes doc-5's "one zoomable map". | 27.1.3, 27.1.11 |
| **27.1.13** | low | _(deferred, ariadne repo)_ Ariadne precision add-on (`block_kind`/`condition_text`/`argument_texts`); sharpens 27.1.7; gates nothing. | — (upstream) |

<!-- SECTION:DECOMPOSITION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 The webview presents a **left-panel flow selector** replacing the entrypoint list; each flow is an agent-detected functionality umbrella (subgraph-induced: seeds + bridge edges + linked docs) rendered as its own connected diagram; on open, the top-ranked flow auto-renders; code reachable from no entrypoint is bucketed into a selectable `unattributed` flow so the selector covers the whole tree
- [ ] #2 Every node carries a human-readable description — a deterministic docstring where present, an agentic default otherwise, overridable by the user (watermark wins)
- [ ] #3 Agent-inferred links (`agentic.bridge`: cross-call-graph + entrypoint→doc) render visually distinct from literal edges and are click-through-explained via `inference_rationale` + provenance `source_range`
- [ ] #4 A flow's diagram re-renders when its code/docs change (out-of-band, not necessarily instantly)
- [ ] #5 **Auto-sync, not review:** per-flow drift on code/doc change **always re-syncs** the affected flow — never gated, never an observation row, never a blocking event
- [ ] #6 User-authored content (description, name, pin) on the affected nodes/edges is **recalled and carried across** the re-sync via the resolver + watermark ladder; a genuine miss (resolver miss, or flow split/merge stranding a name) goes to a recoverable **re-attachment bin**, never auto-pruned
- [ ] #7 Code→diagram resolution is exposed as a named, auditable MCP write (`drift.resolve`: reattach/delete); agent-callable and inspectable
- [ ] #8 Diagram maintenance (flow detection, drift reconciliation) runs as a **detached background sub-agent**: hook-launched, writes the in-process store directly, returns nothing to the main session (no context rot); the user is never interrupted
- [ ] #9 First milestone: a renamed script is reported as one drifted node on session open; accepting carries the hand-written description across, untouched — validated first on a skill's flow (code + docs colocated)
- [ ] #10 The v1 data layer is **strictly the auto-sync**: no `drift_observations`/`drift_adjudications` tables, no `open→triaged→resolved` lifecycle, no cosmetic/intent classifier, no PreCommit gate — all deferred to task-27.1.9 / task-27.1.10
- [ ] #11 The architecture honors task-27.0's reservations and the section-F seams, so task-27.2 (diagram→code), the deferred whole-repo map (task-27.1.12), and the deferred review apparatus are additive — no schema migration, no `render()` signature change, no harness redesign

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

Detail lives in the sub-tasks; this fixes the cross-cutting shape.

### A. The flow as the v1 unit (task-27.1.3, task-27.1.5)

The left-panel **flow selector replaces entrypoints**. A flow = the subgraph **induced** by `{seed entrypoint roots} + {agent-inferred bridge edges} + {linked docs}` (the agent judges only the seam; the call-graph fills each tree's interior). It persists as an `agentic.flow` group node with `agentic.flow_member`/`agentic.bridge` edges (no schema change). A **deterministic stub flow set** ships the selector + render before the agent lands; the **flow-detection custom sub-agent** (task-27.1.5) upgrades the stubs in place. On open the **top-ranked flow auto-renders** (deterministic default ranking; capped top-N list). The **first e2e target is a skill's flow** (task-21.2 corpus). Identity for v1 is the **dominant seed-entrypoint anchor**.

### B. The seam + background-sub-agent execution (task-27.1.4, task-27.1.5)

Flow detection and key-control-flow are agentic-tier work on the agentic lane (see Glossary). **Execution (decided):** a host hook detects a stale flow and **launches a detached background sub-agent** (`spawn_background`) that writes the in-process store directly and returns nothing — the diagram self-heals out-of-band, the session's context stays clean. The task-21.2→27.0 extractor port (task-27.1.4) gives the gap-detection real doc edges and gives the skill-flow target a corpus; task-21.1's duplicate store is closed.

### C. Per-flow auto-sync (task-27.1.6 — the v1 ship point)

On a flow's code/doc change, re-extract the changed files (`re_extract`), re-induce the affected flow(s) from their stored seeds/bridges/docs, and **always re-render** — no review queue. User-authored fields on the touched nodes/edges are recalled and carried across via the resolver + watermark ladder; a resolver miss or a split/merge-stranded name goes to the re-attachment bin (a query over preserved-unresolved content — no new table).

### D. Deferred review apparatus (task-27.1.9, task-27.1.10)

v1 has **no** drift review apparatus. When/if review is wanted: a triage classifier + the typed `TriageSubject`/`TriageVerdict` contract (task-27.1.9, also the task-27.2 reuse seam), and the surfacing layer + the single PreCommit gate (task-27.1.10). These are deferred; v1's honesty guarantee is pure auto-sync.

### E. Key-control-flow (task-27.1.7 — first add-on)

Over one flow, the agent selects and ranks the **key** decisions (golden paths) and suppresses incidental control flow — *selection, not exhaustion*. Converts v1 from "renders the flow" to "renders the essence of the flow." Agent-inferred; not ariadne-gated.

### F. Forward-compatibility seams

Model-level reservations live in task-27.0 (open `origin`/`intent_source`, per-table preserved/disposable tag, resolver state tuple, open render-layer list, named-write path). Local seams: the single `re_extract(file_set, origin)` entry point; position-preserving `apply_hierarchical_layout`; provenance click-through off React Flow selection state; **`kind` stays open everywhere** (new flow/CFG/data-flow content is new namespaced kinds + attributes, never a column or `ALTER`); the render is **generic over containment source** so the deferred whole-repo map (task-27.1.12) and key-control-flow plug in without a `render()` signature change; the hook installer abstracts its install target so portability (task-27.1.8) adds a layout entry, not a refactor.

### G. Deferred (post-v1)

The whole-repo zoomable map (task-27.1.12), clustering (task-27.1.11, a flow-chunking input + refactoring signal), the review apparatus (task-27.1.9/10), and the ariadne add-on (task-27.1.13) are out of v1. v1 renders one bounded flow at a time, folded by the file-module scaffold within a per-view budget.

<!-- SECTION:PLAN:END -->

## Implementation Notes

### Inherited decision: keep a user-promoted field alive across an agentic rebuild (from task-27.0.2 review)

The store keeps a row's structural `layer` and its per-field `field_ownership` on independent axes; `rebuild_layer('agentic')` would hard-delete a user-owned field stranded on an agentic-layer row. **Decision (resolved):** the two `write_fields` wrappers (store + `CustomGraphModel`) promote the row's `layer` to `user` when they stamp a field user-owned — **not** the shared `apply_field_ladder` helper (which stays field-bag-only). It **lands as a prerequisite in task-27.1.2**.

### Decision: the deterministic/agentic seam, the flow unit, and the leaner auto-sync v1

v1's comprehension unit is a **flow** (agent-detected umbrella), not a whole-repo map. Code→diagram is **pure auto-sync**: the diagram always re-syncs and preserves user edits; there is no review queue, no triage classifier, no observation/adjudication tables, no lifecycle states, and no PreCommit gate in v1 — the data layer is strictly the auto-sync (those are deferred to task-27.1.9/10). Flow detection and key-control-flow are **custom background sub-agents** (not SKILL.md skills); skill *directories* are the first input corpus. The whole-repo map and clustering are deferred (the map composes flows; clustering becomes a chunking input + a task-27.2 refactoring signal).

### Provenance of the plan revisions

The decomposition and decisions were produced by successive multi-agent investigations: a 30-agent gap review; a task-20/21 fold; a clustering re-prioritization; a flow-centric v1 reframe; a doc-5 principle examination (→ doc-5.1); and a **21-agent final review** (5 foundations-fit + 6 per-sub-task + 10 bird's-eye) that confirmed the shipped task-27.0 store meets v1's needs with **additive work only, no schema change**, and caught the defects fixed here: the phantom `extractor='agent.inferred'` field (→ the Glossary's `layer`+`kind`+`confidence`), the MCP-write-vs-direct-store-write incoherence (→ the two-primitive harness), the task-21.2/21.1 duplicate-store hazard (→ the 27.0 port + 21.1 closure), the adjudication/triage over-build (→ purged from v1 by the maintainer's auto-sync decision), the false "flow identity already extracted" claim (→ dominant-seed-anchor for v1), the `agentic.contains` overload, and stale backend signatures. Maintainer-resolved: subgraph-induced membership; auto-select the top-ranked flow; skill diagram first; background sub-agent returns nothing; **code→diagram is pure auto-sync with the review apparatus cut from v1**.

<!-- Added when work begins. -->
