---
id: TASK-27
title: Diagram-Driven Development — implementation strategy
status: To Do
assignee: []
created_date: "2026-05-28"
labels:
  - architecture
  - ariadne
  - graph-db
  - mcp
  - hooks
  - skills
  - sub-agents
  - ui
  - consistency
dependencies: []
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
---

## Description

This task is the implementation master-plan for the Diagram-Driven Development capstone. It captures **HOW** we build the functionality specified in `doc-5 — Diagram-Driven Development — Functionality`. Where `doc-5` states observable capabilities, guarantees, and user workflows (the _what_), this task states the chosen mechanisms, schemas, and wiring that deliver them (the _how_).

This is the **parent implementation plan** for the capstone. Its atomic units are children:

- **task-21.1** — persistent graph store with provenance and content-hash invalidation (existing, foundation)
- **task-21.2** — skill diagram v1 render (existing, first concrete surface)
- plus the proposed work units below (overlay layer + watermarking + orphan quarantine; drift inbox + MCP writes + hooks + relevance scoring; authority signals + pin + `diagram.propose` + triage sub-agent; whole-repo zoom + agentic post-processing).

Each child is an independently shippable unit. This task exists to (a) lock in the cross-cutting mechanism choices that every child depends on, (b) record the practical-v1-vs-ideal call for each capability so children don't re-litigate scope, and (c) map every implementation mechanism back to the `doc-5` capability it serves so the two docs stay 1:1.

**Target hosts:** Claude Code + Cursor as primary; OpenCode / Codex / Gemini deferred.

## Acceptance Criteria

- [ ] #1 The persistent store holds nodes, edges, edge provenance, file hashes, the overlay/user layer, the drift inbox, and the pending-edits queue — all behind the `GraphStore` interface, with nothing downstream importing SQLite directly
- [ ] #2 A user customization (label / description / color / group / pin / position) survives a symbol rename, a file move, and a full re-extraction without being re-typed, because it re-anchors via the resolver chain
- [ ] #3 When every resolver in the chain fails, the customization lands in an orphan quarantine bin with full context and is never auto-deleted
- [ ] #4 Code→diagram drift is detected on code/doc change and surfaced **without blocking the editing session** — it is inserted as an observation row, not fired as a blocking event
- [ ] #5 Drift items move through `open → triaged → resolved | dismissed | auto-archived` and are scoped by graph-proximity so the inbox stays tolerable; a dismissed item is not re-surfaced
- [ ] #6 The single intentional blocking interruption is a PreCommit gate that fires only when high-severity drift touches files in the commit
- [ ] #7 A diagram structural edit (rename / delete / group / move) always produces a reviewable proposal in the pending-edits queue and never writes source until the user accepts it in a side-by-side review
- [ ] #8 Accepting a change set applies edits to the working tree only (no auto-commit), triggers re-extraction of affected files, and re-anchors the user layer so customizations follow the changed elements
- [ ] #9 A stale proposal (the code moved underneath since the edit was queued) is detected at accept time and re-resolved or discarded — never misapplied
- [ ] #10 Authority over an element is computed from `last_intent_source` (where intent keeps landing); an explicit `pin` overrides; agent edits executing a pin are marked derivative and do not reset authority
- [ ] #11 The whole repo renders as one connected diagram with a dynamic number of zoom levels, each level within the max-complexity budget, reusing the existing cluster/zoom machinery
- [ ] #12 Agent-inferred edges (gap-filled calls, inferred entrypoint→doc links) render visually distinct from literal-extracted edges and are click-through-explained; accept/reject is persisted and never re-proposed
- [ ] #13 Both sync directions are exposed as named, auditable MCP writes (`drift.resolve`, `diagram.propose`, `user_layer.update`); resolution is agent-callable and inspectable
- [ ] #14 The store survives process restart and crash (WAL + hourly snapshots + git-tracked JSON sidecars); a half-built change set is not lost
- [ ] #15 The same experience is reachable in Claude Code and Cursor via a shared `.claude/` tree (skills + `settings.json` hooks) with the MCP server as the universal fallback

## Implementation Plan

The plan is organized **capability → approach**, mirroring `doc-5`'s capability areas 1:1. Each section names the chosen mechanism and the practical-v1-vs-ideal call.

### A. Persistent store + schema (foundation — task-21.1)

Serves `doc-5`'s durability and "customizations are immortal" guarantees.

- **Engine:** embedded SQLite via `better-sqlite3` — zero-ops, local-first, swappable behind the `GraphStore` interface. Nothing downstream binds to SQLite.
- **Base schema** (task-21.1): `nodes(id, kind, path, anchor, attributes)`, `edges(src_id, dst_id, kind, confidence, attributes)`, `edge_provenance(edge_id, source_file, source_range, extractor_id, extractor_version)`, `file_hashes(path, sha256, size, last_seen_at)`, `schema_version` sentinel.
- **Identity:** node id = `(file_path, anchor?)`. No domain-specific (skill-name) ids inside the store.
- **Edge kind:** namespaced open string (`skill.to_script`, `code.calls`, `doc.path_literal`), treated opaquely.
- **Provenance:** non-optional on every edge insert (`extractor_id`, `extractor_version`, `source_file`, `source_range`, `confidence`) — this is what makes invalidation precise.
- **Schema additions** for the capstone (each lands in its consuming work unit, not all at once):
  - `overlay_layer` — the immortal append-only user layer (field-granularity rows).
  - `alias_history` — prior symbol_paths a node has been known by, for rename detection.
  - `split_of` / `merged_into` — to track node identity through splits and merges.
  - per-attribute confidence — so a node can hold high-confidence structure beside lower-confidence inferred attributes.
  - `referenced_span_hash` — the hash of the prose span an LLM edge keyed on, so the edge invalidates only when that span changes.
- **Durability (HOW for the trust guarantee):** SQLite WAL + hourly snapshots + git-tracked JSON sidecars (triple persistence). Soft-delete with restore for every user-visible destructive op (a `deleted_at` flag, never a hard DELETE on user content).
- **Schema versioning:** nuke-and-rebuild on mismatch — never migrate (project no-backwards-compat policy). Only the disposable extractor layer is rebuilt; the user layer and sidecars are the recovery source.
- **v1 vs ideal:** v1 ships the schema and the invalidation _primitives_ (`compute_file_hash` / `record_file_hash` / `file_changed_since_recorded`, `invalidate_edges_for_files`); the full hash-and-skip incremental loop is deferred until extraction is slow enough to need it.

### B. Two-layer render model (mechanism behind "customizations live separately")

Serves `doc-5` framing 1. The user-facing behavior (your edits live separately and are never overwritten) is in `doc-5`; the mechanism is here.

- `diagram = render(extractor_layer + user_layer)`. The extractor layer is disposable and rebuilt on every code/doc change; the user layer is immortal and append-only.
- **Field-granularity watermarking:** user-owned fields (`label`, `description`, `color`, `group`, `hidden`, `position`) are watermarked at field granularity; structural fields stay extractor-owned. Re-extraction writes only extractor-owned fields, so a watermarked field is never clobbered.

### C. Anchor-resolution chain (mechanism behind "description survives a refactor")

Serves `doc-5` framing 2 and the headline MVP. The user never sees anchors; the only user-facing consequence (descriptions survive renames, never auto-deleted) lives in `doc-5`.

- Resolver chain: `symbol_path → content_hash → rename detection → orphan_quarantine`.
- A downgrade at any link (content_hash miss, rename detected) inserts a drift-inbox row. Total failure moves the customization to the quarantine bin with full context.
- Rename detection reads `alias_history`; splits/merges consult `split_of` / `merged_into`.

### D. Drift inbox + code→diagram sync (mechanism behind "drift is an inbox, not an alarm")

Serves `doc-5` framing 3 and 5 (code→diagram).

- **Drift as inserted rows, not events:** the consistency-engine hooks `INSERT` observation rows; nothing blocks mid-edit. Items run `open → triaged → resolved | dismissed | auto-archived(180d)`.
- **Two-phase consistency loop (verify then update):** on edit, compute edge incidence on the changed files, re-run extractors _only_ on those files, diff new-vs-stored edge sets keyed by `(source_file, source_range, extractor)`, surface obligations against the _old_ graph, then write the update in a second phase. Invalidation triggers: file edits, symbol renames, doc deletions, heading-anchor changes.
- **Separate literal vs LLM caches:** literal edges (identifier mentions, path literals, frontmatter, hyperlinks, `@see`) recompute eagerly keyed by file content hash; LLM-inferred edges cache aggressively and invalidate only when the specific prose span (`referenced_span_hash`) or target symbol changes — same schema, distinct `extractor_id` / `confidence`.
- **MCP write:** `drift.resolve(id, ...)` writes the chosen resolution back (re-anchor an orphaned description, rewrite stale prose, prune an orphan, adjudicate a fuzzy conflict). `user_layer.update(node_id, field, value)` is the general escape hatch for agent edits outside the drift loop.
- **v1 vs ideal:** v1 invalidation deletes/marks-stale every edge whose `source_file` is in the changed set (`invalidate_edges_for_files`). Reverse-incidence invalidation (a renamed symbol invalidating docs that mention it) is deferred — full re-extraction covers it at v1 scale.

### E. Relevance scoring (mechanism behind "inbox stays tolerable")

Serves `doc-5` framing 3 (graph-proximity scoping).

- Drift items are scored by **Ariadne graph-proximity** — structural distance over the existing edge graph from the changed code. Items below a proximity threshold are not surfaced. This reuses the same proximity notion the clustering uses (see section J), keeping one definition of "near."

### F. Surfacing + realtime approximations (mechanism behind "shown at sensible moments")

Serves `doc-5`'s hardest open question. The _question_ (when to surface) is functionality and lives in `doc-5`; the candidate _answers_ are here.

- **Hook → surface mapping (both directions):**
  - `SessionStart` → punch-list banner (outstanding drift count + top items).
  - `UserPromptSubmit` → one-line scoped nudge when the prompt mentions a file with relevant drift.
  - `/drift` slash command → user-invoked side-by-side walkthrough.
  - Pending-edits review panel → triggered when `diagram.propose` queues an op; preview-and-confirm.
  - `PreCommit` → blocking ack gate, only for high-severity drift touching committed files.
  - `PostToolUse` / `Stop` / `FileChanged` → fire the consistency engine (the producers of drift rows).
- **Realtime approximations (deferred ideal):** a true two-way push isn't supported by current Claude Code primitives. Two approximations: (1) **MCP-tool-as-long-poll** — the agent parks in `await_user_edit`, the MCP server blocks on SSE/long-poll until the UI pushes, then returns; requires the agent voluntarily parked. (2) **`FileChanged` / `Stop` hook + headless re-invoke** — when the agent isn't parked, a hook shells out (`claude -p "<event>"`) to start a fresh turn carrying the event. v1 uses the batched surfaces above; the realtime channel is the ideal.

### G. Authority by observation + pin (mechanism behind "authority follows your edits")

Serves `doc-5` framing 4.

- Every edge carries `last_intent_source` (`code-edit | diagram-edit | explicit-pin`) plus a timestamp. Authority is computed from where intent keeps landing.
- **Claim rules:** diagram edits to extractor-relevant fields (label/group/hidden) claim diagram-intent; code edits to diagram-relevant aspects (signature, name, imports, structural edges) claim code-intent; edits not affecting extractor output make no claim; agent edits executing a prior pin are marked **derivative** (not authority-resetting).
- **Pin** = setting `last_intent_source = explicit-pin` ahead of time, so subsequent code change is treated as drift against a deliberate decision rather than overwriting it.

### H. Triage sub-agent (mechanism behind "agent triages, user adjudicates")

Serves `doc-5` framing 5.

- A **drift-triage sub-agent** reads the diff / doc-code pair, decides blast radius, and reports staleness without auto-editing. It runs the **cosmetic-vs-intent classifier**: easy cases unilaterally (description = cosmetic; identifier-shaped rename = intent), and prompts the user on the fuzzy middle (a cluster rename mapping to a directory).
- Sub-agent topology (composition is open): per-cluster workers + an orchestrator that merges, keeping each agent's context small and the run parallelizable. A verifier/calibrator sub-agent can confirm staleness claims.
- The triage sub-agent is also reused to attach rationale to agent-originated `diagram.propose` ops so proposals arrive pre-justified.

### I. Diagram→code sync: MCP surface, change sets, diff view (mechanism behind "review proposed code changes side-by-side")

Serves `doc-5` framing 5 (diagram→code) and the pending-edits surface. Diff-view prior art lives in task-26 (difference maps, Greene module-correspondence, Copilot 3-tier accept, move-detection, stable-layout anchoring).

- **MCP write:** `diagram.propose(op)` where `op = {kind: rename|delete|group|move, target_anchor, new_value, rationale?, origin: user|agent}`. It does not edit code; it **enqueues** a proposed op into the pending-edits queue, mirroring `drift.resolve` so both directions are named and auditable. **Add** is _not_ a `diagram.propose` op — a bare node has no spec, so add routes to a prompt panel that emits a normal coding task. `user_layer.update` handles cosmetic/diagram-only edits (description/color/pin) that make no code claim and never enter the queue. A regroup that maps to a real code boundary is realized as a `move` op; a pure regroup with no code boundary makes no code claim and likewise routes through `user_layer.update`, never `diagram.propose`.
- **Change-set schema (in the SQLite store):**
  - `pending_edit(id, change_set_id, kind, target_anchor, new_value, origin, rationale, status[queued|applied|rejected|stale], created_at, base_anchor_state)` — `base_anchor_state` snapshots `symbol_path + content_hash + referenced_span_hash` at propose time; this is what makes stale-detection possible at accept time.
  - `change_set(id, status[open|reviewing|applied|reverted])` groups pending edits into the unit the user reviews/reverts. Multiple diagram edits before review simply append `pending_edit` rows to the open change set.
  - Targets stored as **anchors, not node ids**, so a proposal survives re-extraction churn until accepted.
- **Side-by-side diff rendering:** **v1 (practical)** — generate the concrete code edit per op eagerly at review time and render a two-pane per-file text diff (rename runs LSP rename if available, else Ariadne reference set → textual rewrite; affected-file set comes from incident edges on the target anchor). Whole-change-set accept/reject; revert-all. **Ideal (later)** — layer in-diagram difference-map styling from task-26 (proposed nodes dashed + reduced opacity + distinct hue, moves shown as paired-color move encoding not delete+add, stable layout via elkjs pinning before-positions; React Flow node data gains `diffStatus`/`provenance`); per-operation accept + piecemeal revert (Copilot 3-tier granularity).
- **Apply mechanics (accept):** re-validate each op's `base_anchor_state` against current code (resolve anchor again, compare hashes). Match → apply; diverged → mark `stale`, surface re-resolve-or-discard, never apply. This stale guard is the single most important correctness mechanism in this direction. Apply writes to the working tree only (never auto-commits): rename = symbol + reference rewrite; delete = soft-delete then remove symbol + user-reviewed incident references; move = relocate + import fixups. v1 applies the whole change set atomically.
- **Round-trip:** after apply, trigger incremental re-extraction of affected files (content-hash keyed); the extractor layer rebuilds, `render()` recomputes, the user layer re-anchors via the resolver chain. If the landed code differs from the proposed diagram state, write a row to the drift inbox (code→diagram) rather than hiding it — the queues compose.
- **Revert:** v1 revert-all discards the open change set's `pending_edit` rows and re-renders (proposed edits are tracked separately, not yet written into either layer, so no destructive undo is needed). Piecemeal revert (delete individual rows) is deferred — the row-per-op schema already supports it.

### J. Whole-repo zoom + agentic post-processing (mechanism behind "one navigable diagram with zoom levels")

Serves `doc-5`'s ecosystem/whole-repo capability and task-21.2 AC#10.

- **Zoom-level computation from a max-complexity budget:** bottom-up hierarchical clustering cut into tiers by a budget, reusing the existing cluster machinery (not new layout).
  1. Start from the fully-connected post-processed graph (leaves = functions/docs/scripts).
  2. Run existing clustering (graph-proximity / community detection over Ariadne + doc edges — the same proximity used for drift scoping in section E) to produce a containment dendrogram.
  3. Single tunable knob: `MAX_COMPLEXITY_PER_LEVEL` (node+edge count or an ELK density score — see open questions).
  4. Cut the dendrogram top-down: a cluster becomes its own zoom level when expanding it in place would exceed the budget; otherwise its children render inline. The _number of levels_ is an emergent property of repo size/density; each rendered view stays within budget.
  5. Persist tier assignment (keyed on graph content hash) so placement is stable across drill-in/out — don't re-cluster per interaction.
- **Agentic post-processing pipeline (batch, run-when-asked):**
  1. Raw extraction (existing): Ariadne code edges + literal doc/frontmatter edges with provenance.
  2. **Gap detection** (cheap, deterministic, pre-agent): query for entrypoints with no incident doc edge, unresolved call-sites / low out-degree at dynamic-dispatch shapes, and disconnected components. This _scopes_ the agent so cost is bounded.
  3. **Entrypoint→doc inference:** hand the agent the entrypoint + candidate docs ranked by the existing relevance scoring; it proposes a link with rationale.
  4. **Call-edge gap-filling (v1 = registry-shaped only):** the agent reads explicit string→symbol maps (route tables, `meta.json sub_agents[]`, listener registries) and emits resolved edges. No arbitrary reflection in v1.
  5. **Write-back:** inferred edges land with a distinct `extractor` value (`agent.inferred`), lower `confidence`, and an `inference_rationale`, so render styles them dashed and offers click-through. Edges go in the extractor/agent layer; accept/reject adjudications persist in the user layer keyed by anchor (reusing the watermark + anchor chain) so they survive re-runs and are never re-proposed.
- **Inferred-vs-literal render:** same schema, distinct `extractor`/`confidence` (exactly the literal-vs-LLM distinction from section D, surfaced visually). Render maps `confidence`/`extractor` to edge style (solid vs dashed/tinted). Zoom boxes aggregate a "gaps inside" count from the inferred-edge and orphan-entrypoint queries.
- **v1 vs ideal:** v1 reuses clustering wholesale and only adds the budget-driven cut + tier persistence; restricts the agent to registry-shaped gaps + entrypoint→doc (highest payoff-to-cost), leaving harder dynamic dispatch as visible dead-ends; batch / run-when-asked (sidesteps the realtime open question). Ideal = arbitrary dynamic resolution, incremental re-inference, tuned per-tier layout — deferred.

### K. UI rendering stack & provenance click-through

Serves `doc-5`'s "distinguishes code vs doc structure" and "inspect why an element exists."

- Extend the existing **React Flow + ELK** UI with doc-node types and cross-modal edge styling; reuse zoom/cluster machinery for drill-down and the ecosystem view.
- Provenance click-through: selecting a node reveals frontmatter and the source prose spans (from `edge_provenance.source_range`) that drove its outgoing edges.
- **Skill ingestion shape** (task-21.2): ingest a skill dir (SKILL.md + scripts/references/agents/assets + root helpers); edges for markdown links, backticked path mentions, `meta.json sub_agents[]`; tolerant frontmatter parsing; false-positive suppression for fenced/mermaid/prose mentions. In-script code structure via Ariadne (TS/JS/Python/Rust); unsupported languages (Bash) become opaque file nodes with a literal-reference body scan. Markdown via remark + mdast keyed on `(path, heading-anchor)` so section moves are detectable.
- **Latency frame:** treat task-21.2's sub-2s warm / sub-5s cold per-skill targets as the budget; cache tier assignments and extraction keyed on content hash so re-render is not re-cluster/re-parse.

### L. Cross-tool distribution

Serves `doc-5`'s "works across multiple hosts."

- Ship a shared `.claude/` tree (skills + `settings.json` hook arrays) for Claude Code + Cursor. OpenCode picks up skills with a JS plugin for hooks. The **MCP server is the universal fallback** (any host that speaks MCP gets `drift.resolve` / `diagram.propose` / `user_layer.update`). Codex / Gemini deferred.

### M. Work-unit decomposition (the children)

- **task-21.1** — persistent graph store (foundation: base schema + invalidation primitives).
- **task-21.2** — skill diagram v1 (the first concrete render surface).
- **Overlay layer + watermarking + orphan quarantine** — sections B, C; schema: `overlay_layer`, `alias_history`, `split_of`/`merged_into`, per-attribute confidence.
- **Drift inbox + `drift.resolve` / `user_layer.update` + SessionStart/UserPromptSubmit hooks + relevance scoring** — sections D, E, F; schema: `referenced_span_hash`.
- **Authority signals + pin override + `diagram.propose` queue + drift-triage sub-agent** — sections G, H, I; schema: `last_intent_source`, `pending_edit`, `change_set`.
- **Whole-repo zoom + agentic post-processing** — section J.

## Implementation Notes

<!-- Added when work begins. -->
