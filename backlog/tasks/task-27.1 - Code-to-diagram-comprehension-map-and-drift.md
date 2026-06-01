---
id: TASK-27.1
title: "Code to diagram: comprehension map and drift"
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
dependencies:
  - task-27
  - task-27.0
  - task-27.0.1
  - task-21.2
  - task-25
parent_task_id: TASK-27
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The code→diagram half of the Diagram-Driven Development capstone. Everything that flows **from the code to the diagram**: building the whole-repo comprehension map on first analysis, and keeping it honest as code changes afterwards.

Serves `doc-5`'s "The whole repo is one zoomable map, built for comprehension" and "From the code to the diagram: drift surfaces for review", and delivers the capstone's first milestone (a renamed script re-syncs with its hand-written description carried along).

Builds on the shared custom graph model (task-27.0): the derived/custom layering, the preservation guarantees, and the anchor resolver. This task adds the code→diagram direction — building the comprehension map from that model, and keeping it in sync as code changes. The keeping-in-sync job is a **diff signal**: when code changes, detect which higher-level (custom-layer) nodes the edit affects, flag it, and reconcile without blocking the developer's flow. The diagram→code direction is task-27.2.

The diagram here is **read-only for authoring**: it presents the comprehension map and surfaces drift for review (accept / dismiss / reattach), but the user does not restructure it. The one layout mutation is node positioning, delegated to task-22. All authoring edits — relabel, group, move, describe-to-restructure, pin/unpin — are the diagram→code direction and live in task-27.2. The architecture built here must leave a clean seam for that later work without baking in read-only assumptions; the seam invariants that keep task-27.2 purely additive are in section G, established by a forward-compatibility review.

<!-- SECTION:DESCRIPTION:END -->

## Decomposition into sub-tasks

<!-- SECTION:DECOMPOSITION:BEGIN -->

This task is delivered through eight sub-tasks. The 11 acceptance criteria below remain the contract; each sub-task delivers a named slice of them. The spine is **milestone-first** (a thin end-to-end vertical slice validates the store + resolver + MCP-write + hook + UI-adapter seam contracts that task-27.2 must reuse), with the entangled clustering core landing in parallel with the infrastructure substrate.

| Sub-task | Pri | Scope | Delivers ACs | Depends on |
| -------- | --- | ----- | ------------ | ---------- |
| **27.1.1** | high | Infrastructure substrate (none exists today): the `drift` MCP server (`drift.resolve` / `drift.list`, audited) over task-27.0's reserved named-write path; a single named agent-invocation / sub-agent dispatch entry point (v1 = bounded synchronous SDK call, Sonnet tier, batching unit, hard cost/time ceiling); the `.claude` hook installer (`SessionStart`/`UserPromptSubmit`/`PostToolUse`/`Stop` + the git pre-commit hook) and the host × surface degradation matrix. | #8, substrate for #5/#6/#7 | task-27.0 |
| **27.1.2** | high | First-milestone thin slice: leaf rename → one drifted node on session open → accept → hand-written description carries across. Leaf-only (no clustering). Lands the **preservation-boundary fix** (`write_fields` promotes row `layer` to `user`), the single named `re_extract(file_set, origin)` entry point, the minimal leaf diff signal, `drift.resolve`, a `SessionStart` banner, the `CustomGraph`→React Flow adapter at leaf granularity, and position-preserving `apply_hierarchical_layout`. | #10, #4, #5, #8, #9, leaf-grade #2, and the re-extraction / position-preserving-layout / selection-readiness portions of #11 | 27.1.1 |
| **27.1.3** | high | Hierarchical clustering + tier persistence + deterministic cluster-node identity (the entangled core). Lift host-neutral clustering vscode→core; generalize per-entrypoint→whole-repo; build the net-new containment hierarchy (recursive re-cluster bounded by `MAX_COMPLEXITY_PER_LEVEL`); persist tiers as `agentic.group` rows + `agentic.contains` edges (no `ALTER`); deterministic cluster-node identity + ≥50% overlap remap; **given-structure-below / clustering-above composition vs task-25**. | #1, #2 (cluster-level), #11 (no migration) | 27.1.2, task-25 |
| **27.1.4** | high | Budget-driven **level-projection transform** + N-tier zoom render + UI drill-in. Collapse below-cut clusters to a group node, drop intra-cluster edges, reroute crossing edges, roll up `gaps_inside`; generalize the binary `ZoomMode`/0.45 threshold to N discrete levels; `render()` signature untouched. | #1, #3 (`gaps_inside`), render/latency part of #11 | 27.1.3 |
| **27.1.5** | high | Consistency-engine breadth: batch resolve-all-anchors pass writing `anchor_resolution`; two-phase verify-then-update diff keyed by `(source_file, source_range, extractor)`; **leaf→cluster up-propagation** over persisted `agentic.contains`; new preserved `drift_observations` + `drift_adjudications` tables (self-registering, no `ALTER`) with the `open → triaged → resolved \| dismissed \| auto-archived(180d)` lifecycle and adjudications as user-layer rows keyed `(anchor, origin, edge_key)` so "never re-proposed" survives the agentic rebuild; hop-distance proximity; re-attachment bin. | #4, #5, #6, #9, persistence half of #3 | 27.1.1, 27.1.3 |
| **27.1.6** | medium | Agentic post-processing pass: cheap gap-detection (orphan entrypoints, low-out-degree dynamic dispatch, disconnected components); registry-shaped call-edge + entrypoint→doc inference written back as `extractor='agent.inferred'`/lower confidence/`inference_rationale`/click-through; **deterministic-first** node descriptions (Ariadne docstring where present with no LLM call; batched LLM only for the rest; content-hash cached; hard cap with symbol-name placeholder). Doc-node inference gates behind task-21.2. | #2 (descriptions), #3 (inferred edges) | 27.1.1, 27.1.3, task-21.2 |
| **27.1.7** | medium | Drift triage sub-agent (spawned, out-of-band, per-cluster workers + merging orchestrator) + cosmetic/intent **classifier decision table** (deterministic from resolver verdict + edge-diff; naming the LLM-only arms) + the typed generic `TriageSubject`/`TriageVerdict` contract exported from `@code-charter/types` (so task-27.2 reuses it unchanged). | #6, #7 (classification), #11 (reusable triage seam) | 27.1.1, 27.1.5 |
| **27.1.8** | medium | Delivery surfaces + the single **PreCommit git-hook gate** (fires only for structural/intent drift in state `open\|triaged` touching staged files; never cosmetic/resolved/dismissed; `--no-verify` bypass; fire/no-fire matrix test) + the change-scoped **comprehension summary** (group a change-set's drift rows into one behaviour-level narrative; per-anchor rows as drill-down; map-diff out of scope). | #5, #7, #8 (`drift.list` + host degradation) | 27.1.5, 27.1.7 |

<!-- SECTION:DECOMPOSITION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 The whole repo renders as one connected diagram with a dynamic number of zoom levels, each level within the max-complexity budget, reusing the existing cluster/zoom machinery
- [ ] #2 Each level is grouped by what code does (behaviour), not where it lives, and every node carries a human-readable description — a default behaviour summary is generated for every node on first analysis and is overridable by the user (watermark wins)
- [ ] #3 Agent-inferred edges (gap-filled calls, inferred entrypoint→doc links) render visually distinct from literal-extracted edges and are click-through-explained; accept/reject is persisted and never re-proposed
- [ ] #4 The diagram re-renders when code or docs change (not necessarily instantly)
- [ ] #5 Code→diagram drift is detected on code/doc change and surfaced **without blocking the editing session** — inserted as an observation row, not fired as a blocking event
- [ ] #6 Drift items move through `open → triaged → resolved | dismissed | auto-archived` and are scoped by graph-proximity so the inbox stays tolerable; a dismissed item is not re-surfaced
- [ ] #7 The single intentional blocking interruption is a PreCommit gate that fires only for still-open structural/intent drift (changed call structure, removed entrypoint, rename) touching files in the commit — never for cosmetic drift, and never for already-resolved/dismissed drift
- [ ] #8 Code→diagram resolution is exposed as a named, auditable MCP write (`drift.resolve`); resolution is agent-callable and inspectable
- [ ] #9 A customization that fails the resolver chain (task-27.0) is surfaced in a recoverable re-attachment bin where the user reattaches or deletes it — never silently auto-pruned (the preservation guarantee itself is task-27.0)
- [ ] #10 First milestone: a script renamed in the code is reported as one drifted node on session open; accepting it re-renders the diagram onto the renamed script with the hand-written description carried along, untouched
- [ ] #11 The architecture honors task-27.0's model reservations and the local seams in section G, so task-27.2 (diagram→code) can be added without a schema migration, a `render()` signature change, a sub-agent redesign, or a layout-entry-point refactor

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

### A. Whole-repo zoom from a max-complexity budget

Serves `doc-5`'s "one zoomable map" capability and task-21.2 AC#10. Built in **task-27.1.3** (hierarchy + tier persistence + cluster-node identity) and **task-27.1.4** (level-projection transform + N-tier render).

- **Zoom levels computed from a budget**, not hand-authored. The _number_ of levels is **emergent** from a single knob `MAX_COMPLEXITY_PER_LEVEL` (node+edge count or an ELK density score, tuned so each rendered view stays within a legible-text budget) — not fixed. Start from the post-processed graph (leaves = functions/docs/scripts); connectivity end-to-end is delivered by section B's gap-filling.
- **Composition (decided): given structure below, behaviour clustering above.** The lower tiers reuse the developer's _own_ structure as a free, deterministic, stable scaffold — functions → files → directories → language built-in modules (Rust `mod`, Python package, Java/TS class). Semantic clustering builds the architectural tiers _above_ the module level, where the given structure stops carrying behavioural meaning. This composition is owned by task-27.1.3 and depends on **task-25**'s `ModuleResolver` (the file / directory / built-in-module grouping). Every node at every tier still carries a behaviour description (section B.5), so a level reads as a story about behaviour — the given structure supplies the _scaffold_, the descriptions supply the _meaning_, reconciling AC#2's "grouped by what code does, not where it lives" with a stable lower scaffold.
- **The hierarchy is net-new algorithm work, not a wholesale reuse.** The delivered clustering (`packages/vscode/src/clustering/*`) is a single **flat** spectral partition (`findOptimalClusters` → `string[][]`), not a containment dendrogram. task-27.1.3 builds the multi-level hierarchy by applying that flat-cluster primitive **recursively** (re-cluster any partition that exceeds `MAX_COMPLEXITY_PER_LEVEL` until every partition is within budget) above the module scaffold. The genuine reuse is the embedding computation, the similarity/adjacency matrix, and `findOptimalClusters` as the leaf primitive. Two prerequisite lifts: (a) move the host-neutral clustering logic from `packages/vscode` into `packages/core` so it runs without the tfjs/vscode deps; (b) generalize the call contract from per-entrypoint (`cluster_code_tree(top_level_symbol)`) to whole-repo (all nodes in the post-processed graph).
- **Tier assignment + membership are persisted** as agentic-tier `agentic.group` node rows + `agentic.contains` edges, keyed on graph content hash, so placement is stable across drill-in/out — **never re-cluster per interaction**. Because re-clustering is non-deterministic, cluster-node identity must be **deterministic** to survive a rebuild (task-27.1.3): the stable id is a canonical hash of the sorted set of member-leaf anchors, with a ≥50% membership-overlap remap that re-attaches user-owned fields rather than stranding them (the cluster-node analogue of the resolver's `relocated` verdict). This fits task-27.0's no-`ALTER` store with **no migration** — `kind`/`origin` on `NodeRow` and `kind` on `EdgeRow` are already open-valued; tier is not a new table.
- **Render is a level-projection transform** (task-27.1.4): for a given active level, clusters below the cut collapse to one group node, intra-cluster edges drop, crossing edges reroute to the group boundary, and the `gaps_inside` count (inferred edges + orphan entrypoints inside the collapsed cluster) rolls up onto the group node for the UI. The existing binary `ZoomMode` (`zoomedIn`/`zoomedOut`, single 0.45 threshold) is generalized to N discrete levels.

### B. Agentic post-processing pipeline (batch, run-when-asked)

Closes the gaps static analysis can't, so the map is connected end to end.

1. Raw extraction (existing): Ariadne code edges + literal doc/frontmatter edges with provenance.
2. **Gap detection** (cheap, deterministic, pre-agent): query for entrypoints with no incident doc edge, unresolved call-sites / low out-degree at dynamic-dispatch shapes, and disconnected components. This _scopes_ the agent so cost is bounded.
3. **Entrypoint→doc inference:** hand the agent the entrypoint + candidate docs ranked by the existing relevance scoring; it proposes a link with rationale.
4. **Call-edge gap-filling (v1 = registry-shaped only):** the agent reads explicit string→symbol maps (route tables, `meta.json sub_agents[]`, listener registries) and emits resolved edges. No arbitrary reflection in v1.
5. **Default node descriptions:** the post-processing agent emits a one-line behaviour summary per function/cluster node as an extractor-owned `description`, so every node reads as behaviour on first analysis without anyone hand-authoring it. These are lower-confidence and watermark-overridable: a user edit claims the field as user-owned (per task-27.0's dual-sourced `description`), after which re-extraction never overwrites it.
6. **Write-back:** inferred edges land with a distinct `extractor` value (`agent.inferred`), lower `confidence`, and an `inference_rationale`, so render styles them dashed and offers click-through to the originating source span/registry entry (via `edge_provenance.source_range`). Edges go in the extractor/agent layer; accept/reject adjudications persist in the user layer keyed by anchor (reusing the watermark + anchor chain) so they survive re-runs and are never re-proposed.

- **Inferred-vs-literal render:** same schema, distinct `extractor`/`confidence`. Render maps `confidence`/`extractor` to edge style (solid vs dashed/tinted). Zoom boxes aggregate a "gaps inside" count from the inferred-edge and orphan-entrypoint queries.
- **v1 vs ideal:** v1 reuses clustering wholesale and only adds the budget-driven cut + tier persistence; restricts the agent to registry-shaped gaps + entrypoint→doc (highest payoff-to-cost), leaving harder dynamic dispatch as visible dead-ends; batch / run-when-asked. Ideal = arbitrary dynamic resolution, incremental re-inference, tuned per-tier layout — deferred.

### C. Drift inbox + code→diagram sync (the diff signal)

Serves `doc-5`'s "drift surfaces for review".

The core of this task: when code changes, a **diff signal** identifies which higher-level (custom-layer) nodes the edit affected — computed by re-resolving the affected anchors through task-27.0's resolver and diffing against the stored graph. The signal flags the change without blocking the developer; reconciliation happens out-of-band (section E) so the main agent keeps working.

- **Drift as inserted rows, not events:** the consistency-engine hooks `INSERT` observation rows; nothing blocks mid-edit. Items run `open → triaged → resolved | dismissed | auto-archived(180d)`. The drift row carries an open-valued `origin` (per task-27.0); this task only ever writes `code-change`.
- **Two-phase consistency loop (verify then update):** on edit, compute edge incidence on the changed files, re-run extractors _only_ on those files, diff new-vs-stored edge sets keyed by `(source_file, source_range, extractor)`, surface obligations against the _old_ graph, then write the update in a second phase. Invalidation triggers: file edits, symbol renames, doc deletions, heading-anchor changes.
- **Separate literal vs LLM caches:** literal edges (identifier mentions, path literals, frontmatter, hyperlinks, `@see`) recompute eagerly keyed by file content hash; LLM-inferred edges cache aggressively and invalidate only when the specific prose span (`referenced_span_hash`) or target symbol changes — same schema, distinct `extractor_id` / `confidence`.
- **Relevance scoring (inbox stays tolerable, scoped to your current work):** drift items are scored by **graph hop-distance** over the existing edge graph — the min BFS hop-count from any working-set leaf to the drift item's leaf nodes (for a cluster node, the min over its member leaves). The **working set** for v1 is the ordered list of files touched in the current session, populated by the `PostToolUse`/`FileChanged` hooks recording each written path (no cross-session persistence); when no hook data is available (e.g. on session open before any edit), it falls back to the most-recently-changed files by `file_hashes.last_seen_at`. Items below a hop-distance threshold are not surfaced, so the inbox reflects _your current work_ rather than repo-wide churn. This is a **distinct** proximity measure from section A's clustering (which uses the embedding + adjacency matrix for grouping quality): both derive from the one edge graph, but drift scoping uses cheap, deterministic, embedding-free hop-distance.
- **MCP write:** `drift.resolve(id, ...)` writes the chosen resolution back (re-anchor an orphaned description, rewrite stale prose, prune an orphan, adjudicate a fuzzy conflict).
- **Re-attachment bin (the repair UX for a broken anchor):** when task-27.0's resolver reports a miss for a customization, this task surfaces it in a re-attachment bin — it waits there, recoverable, until the user reattaches it (via `drift.resolve` re-anchor) or deletes the element. The preservation guarantee itself (never auto-pruned; soft-deleted and restorable; never purged by re-extraction) is task-27.0's; this task owns only the surfacing and the reattach/delete actions.
- **v1 vs ideal:** v1 invalidation deletes/marks-stale every edge whose `source_file` is in the changed set (`invalidate_edges_for_files`). Reverse-incidence invalidation (a renamed symbol invalidating docs that mention it) is deferred — full re-extraction covers it at v1 scale.

### D. Drift surfacing (when to show it)

Serves `doc-5`'s hardest open question — "when to surface drift without it feeling like paperwork." The candidate answers:

- **Hook → surface mapping:**
  - `SessionStart` → punch-list banner (outstanding drift count + top items).
  - `UserPromptSubmit` → one-line scoped nudge when the prompt mentions a file with relevant drift.
  - `/drift` slash command → user-invoked side-by-side walkthrough.
  - `PreCommit` → blocking ack gate, only for drift the triage classifier (section E) marks as **structural/intent** — a changed call structure, a removed entrypoint, an identifier-shaped rename — never for cosmetic drift (a reflowed description, a moved line). It fires only when such drift is still in state `open | triaged` (not yet resolved/dismissed) and touches files in the commit, so an already-acknowledged drift never re-blocks. ("Consequential" in doc-5 == structural per section E; this is the only deliberate interruption.)
  - `PostToolUse` / `Stop` / `FileChanged` → fire the consistency engine (the producers of drift rows).
- **Graceful degradation across hosts:** the live surfaces above assume host hook primitives. Where a host lacks one (e.g. no `SessionStart` on Cursor), the live banner degrades to a user-invoked surface — the `/drift` slash command, or an MCP pull of outstanding drift — so the experience persists without the live push. The MCP server is the universal fallback for the write tools; this is the fallback for the read surfaces.
- **Realtime approximations (deferred ideal):** a true two-way push isn't supported by current Claude Code primitives. Two approximations: (1) **MCP-tool-as-long-poll** — the agent parks in `await_user_edit`, the MCP server blocks on SSE/long-poll until the UI pushes, then returns; requires the agent voluntarily parked. (2) **`FileChanged` / `Stop` hook + headless re-invoke** — when the agent isn't parked, a hook shells out (`claude -p "<event>"`) to start a fresh turn carrying the event. v1 uses the batched surfaces above; the realtime channel is the ideal.
- **v1 live surface posture (decided):** for a large agent-made change, the **drift rows + punch-list banner are the v1 live surface**; the zoomable map is a _rebaselined current-state reference_, not a before/after diff view. A code→diagram **change-summary narrative** — grouping a change-set's drift rows into one behaviour-level story so the human reads intent, not a long row list (doc-5's "direct change as intent") — is built in task-27.1.8, sharing the triage orchestrator's merged output. A before/after _map diff_ is out of scope for this direction (the section G before-position seam serves task-27.2 only).

### E. Drift triage — out-of-band, so the main agent keeps working

Serves `doc-5`'s "the agent resolves trivial drift itself and escalates only the architectural."

- **Spawned, not inline:** when the diff signal (section C) fires, the main agent is flagged and can hand reconciliation to a **triage sub-agent** (a Sonnet sub-agent is the right tier — cheap, capable, parallelizable) so the main agent continues its regular work uninterrupted. The sub-agent reconciles drift and reports back; it does not block the session.
- **Cosmetic-vs-intent classifier:** the sub-agent decides blast radius and reports staleness without auto-editing the source. Easy cases it resolves unilaterally (a reflowed description = cosmetic; an identifier-shaped rename = intent); it prompts the user on the fuzzy middle (a cluster rename mapping to a directory).
- **Generic triage subject:** the sub-agent's input is a generic `{before-state, proposed-after-state, anchor, rationale?}` triage request, and its verdict is independent of whether the subject came from a code edit or (later) a proposed diagram op — so task-27.2 reuses the identical agent for actionability without redesigning its interface.
- **Topology (composition is open):** per-cluster workers + an orchestrator that merges, keeping each agent's context small and the run parallelizable. A verifier/calibrator sub-agent can confirm staleness claims.

### F. UI rendering + provenance click-through

Serves `doc-5`'s "distinguishes code vs doc structure" and "inspect why an element exists."

- Extend the existing **React Flow + ELK** UI with doc-node types and cross-modal edge styling; reuse zoom/cluster machinery for drill-down and the ecosystem view.
- Provenance click-through: selecting a node reveals frontmatter and the source prose spans (from `edge_provenance.source_range`) that drove its outgoing edges.
- **Read-only for authoring:** the only diagram mutation in this task is node positioning (task-22). Authority/pin and all structural editing belong to task-27.2; this task neither writes nor displays authority. The UI must be built so the later editing/diff/review surfaces in task-27.2 are an additive layer, not a rewrite — see the forward-compatibility seam below.
- **Skill ingestion shape** (task-21.2): ingest a skill dir (SKILL.md + scripts/references/agents/assets + root helpers); edges for markdown links, backticked path mentions, `meta.json sub_agents[]`; tolerant frontmatter parsing; false-positive suppression for fenced/mermaid/prose mentions. In-script code structure via Ariadne (TS/JS/Python/Rust); unsupported languages (Bash) become opaque file nodes with a literal-reference body scan. Markdown via remark + mdast keyed on `(path, heading-anchor)` so section moves are detectable.
- **Latency frame:** sub-2s warm / sub-5s cold is the per-**view** (single budget-capped tier) render target — cache tier assignments and extraction keyed on content hash so re-render is not re-cluster/re-parse. Whole-repo **first analysis** (tier cut + initial extraction + agentic post-processing) is a batch, run-when-asked operation with **no wall-clock SLA**, consistent with section B.

### G. Forward-compatibility seam (keeping task-27.2 additive)

A five-agent architecture review confirmed that building this task read-only is compatible with a later task-27.2 (diagram→code) — purely additive, no rework — provided the seams below hold. The **model-level** reservations that serve both directions live in task-27.0: open-valued `origin`/`intent_source` fields, the per-table preserved/disposable tag, the anchor resolver returning the full `{symbol_path, content_hash, span_hash}` tuple, the open ordered render-layer list, and a generic named-write/audit path for MCP writes. What remains here are the seams local to this task's sync engine and UI:

- **Re-extraction is a single named in-process entry point taking `(file_set, origin)`.** The host file-change hooks (section D) are merely one caller (`origin=code-change`). So task-27.2's apply becomes another caller (`origin=apply`) rather than forcing a refactor, and the single attributed funnel resolves the double-fire hazard (an apply edits the working tree, which itself fires `FileChanged`). What an `apply`-origin re-extraction resets is an authority question, and authority is task-27.2's concern — this task only tags the origin.
- **`apply_hierarchical_layout` honors a caller-supplied set of fixed node positions** (passed to ELK as fixed-position `layoutOptions`, with the overwrite skipped for those ids), even though this task's only caller pins nothing — so task-27.2 supplies before-positions for stable diffs without refactoring the layout entry point. Today the function overwrites every position from ELK; keeping it position-preserving is the one concrete code change to make now (landed in task-27.1.2). This before-position seam serves **task-27.2's diagram→code diff view only**; it is **not** a hook for a code→diagram before/after map diff, which is out of scope for this direction (see section D).
- **Provenance click-through is driven off React Flow's selection state** (`onSelectionChange` / the `selected` prop), not by overloading the per-node `navigate_to_file` `onClick` — leaving selection as a fan-out signal a later review / accept-reject mode also subscribes to.

<!-- SECTION:PLAN:END -->

## Implementation Notes

### Inherited decision: keep a user-promoted field alive across an agentic rebuild (from task-27.0.2 review)

Section B.5 promises that once a user edit claims a `description` as user-owned, "re-extraction never
overwrites it." A 10-agent review of task-27.0.2 confirmed this guarantee is **not yet enforced by the
store** and this task must close it.

The store keeps two independent axes: a row's structural `layer` and its per-field `field_ownership`.
`write_fields` promotes a field's *ownership* but deliberately never moves the row's `layer`. So a
user-promoted `description` can sit on a `layer='agentic'` row while owned by `user`. `rebuild_layer`
deletes by **layer** (`WHERE layer=? AND deleted_at IS NULL`) with no ownership re-check — so the
agentic post-processing pipeline (section B), invoked as `rebuild_layer('agentic')`, **hard-deletes
that whole row, user-owned field and all**, whenever the rebuild writer does not re-emit the same id.
The `write_fields` ladder cannot protect a row that no longer exists. The same hazard applies to a
user-owned field that ends up on a `layer='raw'` row across `rebuild_layer('raw')`.

Decide the mechanism here (and/or in task-27.2 / task-27.0, which carries the "agentic/user content is
never hard-deleted" guarantee). Candidate fixes the review surfaced:

- **Promote the row's `layer` on user edit** so a user-owned field forces `layer='user'` (authority
  follows edits) and rebuild never deletes it — robust, but changes the task-27.0.1 `write_fields`
  contract and migrates a described node's render layer (task-27.0.4 concern).
- **Guarantee the agentic rebuild writer always re-emits** every row it intends to keep, so the ladder
  protects the user field on rewrite — keeps the store unchanged but makes the agentic pass responsible.
- **Ownership-aware delete / guard in `rebuild_layer`** — closes it in the store but adds the
  re-check task-27.0.2 AC#3 explicitly excludes, so AC#3 would need rewording.

**Decision (resolved):** adopt the first candidate — **`write_fields` promotes the row's structural
`layer` to `user` whenever it stamps a field user-owned**, so the row vacates the rebuild-eligible
layer before the next agentic pass. Rejected: "re-emit kept rows" (fragile for non-deterministic
cluster-node ids — you cannot re-emit an id you did not generate) and "ownership-aware guard in
`rebuild_layer`" (contradicts task-27.0.2 AC#3's explicit exclusion of a re-check inside
`rebuild_layer`). This is the only candidate that also covers non-deterministic cluster nodes. Impact:
it changes the task-27.0.1 `write_fields` contract docstring and touches task-27.0.4 `render()` layer
semantics (cosmetic — the layer list is open and ordered, so `user`-layer nodes already render in the
top slot). It **lands as a prerequisite in task-27.1.2**, before any agentic-pass code (task-27.1.6)
can trigger the data-loss path.

### Decision: comprehension-map layer composition (given structure below, clustering above)

The map's tier hierarchy is **not** built by semantic clustering alone. The lower tiers reuse the
developer's own structure as a deterministic, free, stable scaffold — functions → files → directories
→ language built-in modules (Rust `mod`, Python package, Java/TS class) — and semantic clustering
builds the architectural tiers **above** the module level. Every node still carries a behaviour
description, so AC#2's "grouped by what code does, not where it lives" holds at the reading layer: the
given structure supplies the scaffold, the descriptions supply the meaning. This makes **task-25**
(the `ModuleResolver` for file/directory/built-in-module grouping) a dependency, and the composition
is owned by task-27.1.3. (The alternative — behaviour clustering at every tier with file structure
excluded — was considered and rejected for v1: it discards a free, stable, legible scaffold and makes
the lower tiers depend entirely on a non-deterministic, embedding-driven cut.)

### Provenance of the plan revisions and the decomposition

The section A "reuse → net-new algorithm work" correction, the persisted-tier / deterministic
cluster-node-identity additions, the `drift_observations`/`drift_adjudications` table requirement, the
PreCommit-as-git-hook correction, the typed `TriageSubject`/`TriageVerdict` contract, the
deterministic-first description policy, the working-set/hop-distance proximity precision, the latency
re-scoping, and the eight-way decomposition were produced by a 30-agent investigation workflow
(10 lens analyses → synthesis → adversarial gap verification → three decomposition proposals → judge).
14 gaps were confirmed against the as-built `packages/core` foundation and the doc-5 vision; one
candidate (a claimed conflict between behaviour-grouping and file structure) was refuted and instead
resolved as the composition decision above.

<!-- Added when work begins. -->
