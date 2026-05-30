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
  - task-21.1
  - task-21.2
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

Serves `doc-5`'s "one zoomable map" capability and task-21.2 AC#10.

- **Zoom levels computed from a budget**, not hand-authored: bottom-up hierarchical clustering cut into tiers, reusing the existing cluster machinery (not new layout).
  1. Start from the post-processed graph (leaves = functions/docs/scripts); connectivity end-to-end is delivered by section B's gap-filling.
  2. Run existing clustering (graph-proximity / community detection over Ariadne + doc edges — the same proximity used for drift scoping in section C) to produce a containment dendrogram.
  3. Single tunable knob: `MAX_COMPLEXITY_PER_LEVEL` (node+edge count or an ELK density score).
  4. Cut the dendrogram top-down: a cluster becomes its own zoom level when expanding it in place would exceed the budget; otherwise its children render inline. The _number of levels_ is emergent from repo size/density; each rendered view stays within budget. The top tier reads as the system's architecture, intermediate tiers as functional groups, and the leaf tier as individual functions and their docs — the architecture-to-function spectrum doc-5 calls for.
  5. Persist tier assignment (keyed on graph content hash) so placement is stable across drill-in/out — don't re-cluster per interaction.
- **Grouped by behaviour:** clusters and node descriptions present _what the code does_, so a level reads as a story about behaviour, not a directory listing.

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
- **Relevance scoring (inbox stays tolerable, scoped to your current work):** drift items are scored by **Ariadne graph-proximity** — structural distance over the existing edge graph. Proximity is measured from the files in the current session's working set (recently edited / open / referenced in the active prompt), not from every changed file globally, so the inbox reflects _your current work_ rather than repo-wide churn. Items below a proximity threshold are not surfaced. This reuses the same proximity notion the clustering uses (section A), keeping one definition of "near."
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
- **Latency frame:** treat task-21.2's sub-2s warm / sub-5s cold per-skill targets as the budget; cache tier assignments and extraction keyed on content hash so re-render is not re-cluster/re-parse.

### G. Forward-compatibility seam (keeping task-27.2 additive)

A five-agent architecture review confirmed that building this task read-only is compatible with a later task-27.2 (diagram→code) — purely additive, no rework — provided the seams below hold. The **model-level** reservations that serve both directions live in task-27.0: open-valued `origin`/`intent_source` fields, the per-table preserved/disposable tag, the anchor resolver returning the full `{symbol_path, content_hash, span_hash}` tuple, the open ordered render-layer list, and a generic named-write/audit path for MCP writes. What remains here are the seams local to this task's sync engine and UI:

- **Re-extraction is a single named in-process entry point taking `(file_set, origin)`.** The host file-change hooks (section D) are merely one caller (`origin=code-change`). So task-27.2's apply becomes another caller (`origin=apply`) rather than forcing a refactor, and the single attributed funnel resolves the double-fire hazard (an apply edits the working tree, which itself fires `FileChanged`). What an `apply`-origin re-extraction resets is an authority question, and authority is task-27.2's concern — this task only tags the origin.
- **`apply_hierarchical_layout` honors a caller-supplied set of fixed node positions** (passed to ELK as fixed-position `layoutOptions`, with the overwrite skipped for those ids), even though this task's only caller pins nothing — so task-27.2 supplies before-positions for stable diffs without refactoring the layout entry point. Today the function overwrites every position from ELK; keeping it position-preserving is the one concrete code change to make now.
- **Provenance click-through is driven off React Flow's selection state** (`onSelectionChange` / the `selected` prop), not by overloading the per-node `navigate_to_file` `onClick` — leaving selection as a fan-out signal a later review / accept-reject mode also subscribes to.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
