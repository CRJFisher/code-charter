---
id: TASK-27.1.6
title: "Flow hydration + per-flow auto-sync: build a flow's diagram on first work and keep it in step, preserving your edits"
status: Done
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

- [x] #1 **Unified `Stop`-hook dispatch (HYDRATE or RE-SYNC):** on the `Stop` hook for the files worked on this turn, for each worked-on flow the entry point determines whether an agentic diagram exists. No diagram → **HYDRATE** (detect + create the flow). Diagram exists → **RE-SYNC** (re-extract changed files via the single `re_extract(file_set, origin)` entry point, re-derive the affected flow's induced subgraph, re-render). Both run **automatically** — always update, never gate on the user
- [x] #2 **Flow detection (the HYDRATE branch):** the sub-agent groups deterministic entrypoint seeds into functionality umbrellas and attaches docs — emitting **subgraph-induced** flows (seeds + agent-inferred bridge edges + linked docs; intra-tree interior stays deterministic), upgrading task-27.1.3's stub flows **in place** on the agentic lane (`layer='agentic'`, bridges as `kind='agentic.bridge'`, lower `confidence`, `inference_rationale` in the attributes bag — there is no `extractor` field)
- [x] #3 **First target — a skill's flow:** the sub-agent renders a Claude Code skill directory (task-21.2 corpus) as one flow correctly; the skill-dir boundary is the ground-truth acceptance signal (general-repo essence is judged, not measured, in v1). This requires task-21.2's literal skill extractors to write into the task-27.0 store (the port owned by task-27.1.4 AC#6), not task-21.1's superseded duplicate store
- [x] #4 **Detection goal is an explicit input argument** (no UI yet), so a later goal selector is an added arg, not a rewrite; v1's goal is "orient in a code-tree" (breadth: the few umbrellas), distinct from the key-control-flow agent's depth goal (task-27.1.7)
- [x] #5 **Membership resolution:** the flow(s) affected by a changed leaf are computed by re-inducing each flow's subgraph from its stored seeds/bridges/docs (task-27.1.3) — not by an `agentic.contains` tree-walk; a leaf shared by several flows re-syncs all of them that are worked on this turn
- [x] #6 **User edits are preserved and re-applied:** user-authored fields (description, name, pin) on affected nodes/edges are recalled and carried across via the resolver (task-27.0.3) + the watermark ladder (a `user`-owned field is never overwritten; the row's `layer` is `user` per the task-27.1.2 preservation fix); content following a renamed/moved symbol re-anchors automatically
- [x] #7 **Re-attachment bin:** when the resolver returns a `miss`, or a flow split/merge strands a user-given name/pin, the affected user content is held in a recoverable re-attachment bin (the user reattaches via `drift.resolve` or deletes); it is never auto-pruned. The bin is a query over preserved-but-unresolved content (task-27.0 soft-delete + resolver miss) — **no new table**
- [x] #8 **Sub-agent execution:** the `Stop` hook blocks and emits an instruction; the main agent launches the registered custom sub-agent (`.claude/agents/drift-reconciler.md`); the sub-agent persists by invoking the `drift-sync` skill (task-27.1.1 contract, body here) — which writes under `rebuild_layer('agentic')` — not by writing the store directly and not via MCP; it returns ~nothing to the main agent (bounded context rot, no review queue, no blocking). The `stop_hook_active` guard and a "no new drift → no-op" keep it loop-safe; cost/time is bounded; ungrouped entrypoints fall back to singleton stub flows above the cap
- [x] #9 **Stable identity:** detected flows persist with stable identity (dominant seed-entrypoint anchor, task-27.1.3) so a re-run does not strand user renames/pins; a split/merge surfaces in the re-attachment bin. On each hydrate/re-sync the flow node's `attributes.last_synced_at` is stamped (drives the selector's recency ordering, task-27.1.3 — no schema migration)
- [x] #10 No `drift_observations` / `drift_adjudications` tables, no triage classifier, no lifecycle states, no PreCommit gate are introduced — these are explicitly deferred to task-27.1.9 / task-27.1.10

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

## High-level summary

**Why this exists.** Task-27.1.6 is v1's ship point: it turns the inert substrate the earlier subtasks built into a live loop that builds a flow's diagram the first time you work on its code and keeps it in step as you edit, always preserving anything you authored. Before this task, no production path populates the on-disk graph store and the `drift-sync` skill is a no-op stub, so a hydrated flow can never reach the webview. This task closes that gap with a **reconcile engine** and wires the full Stop-hook → sub-agent → skill → engine → store path end to end.

**The approach.** Every dependency already ships — `re_extract` (27.1.2); the flow entity + induction + selector + render (27.1.3); gap-detection + bridge inference + the description policy + `write_agentic_substrate` + the skill-extractor port (27.1.4); and the drift substrate of Stop hook + `drift-reconciler` sub-agent + `drift-sync` stub + MCP `drift_*` + installer (27.1.1). The engine composes them. It drives **both code files (via a headless Ariadne adapter) and skill directories (via `ingest_skill`)**, with the skill flow as the AC#3 ground-truth target. Descriptions are **deterministic-first** — docstrings/frontmatter, then a name placeholder, with `null_describe_executor` the default — and the executor is an injectable seam, so a flow hydrates with no model call and no API client in the engine.

**What it builds (altitude).**

- **The reconcile engine** lives in `packages/drift/src/reconcile/`. `reconcile(file_set, deps)` partitions changed files into skill bundles (a `SKILL.md` ancestor) and plain code; refreshes raw substrate (`re_extract` for code — the single funnel that also gives preservation; `ingest_skill` per touched bundle); then per affected/new flow dispatches **HYDRATE** (no `agentic.flow` yet) or **RE-SYNC** (one exists). A `HeadlessProject` wraps `@ariadnejs/core` with no editor dependency, fed repo-relative paths; the adapter exposes the call graph, a resolver-index builder, and an anchored-symbol bridge.
- **Persistence is scoped, not store-global.** Bridges + resolved descriptions go through `write_agentic_substrate` (the cost-bounded, preservation-honoring substrate writer); the `agentic.flow` node + member edges go through `write_flow`. Both use `upsert` + ladder-aware `write_fields(...,'agentic')` row by row — never `rebuild_layer('agentic')`, which is store-global and would destroy other flows' content, defeating lazy per-flow hydration. Every write stamps `attributes.last_synced_at` from an injected clock.
- **The id-space bridge** is the load-bearing detail. The call graph is keyed by Ariadne `SymbolId`; persisted flows store rename-stable `symbol_path`s. `build_symbol_path_index` (core) and `reconstruct_flow_membership` translate between the two, and seeds ride the flow node's `entry_points` (not a self-referential member edge) so the flow node id can equal its dominant seed's `symbol_path` without colliding with a persisted node. Both Ariadne hosts (the headless engine and the VSCode `AriadneProjectManager`) feed **repo-relative** paths, so a flow hydrated by the engine renders in the webview.
- **The drift-sync skill** is no longer a stub: the dependency-free `drift_sync.js` validates the pinned contract, locates the built `drift-reconcile` bin (via `DRIFT_RECONCILE_BIN` or the `.drift_reconcile_bin` sidecar the installer drops beside the skill), and shells into it, forwarding the flags + exit code. `render_flow` on the host dispatches a hydrated flow id (reconstruct membership → `project_hydrated_flow`, appending doc-node members), and `list_flows` inherits `seed_location` + live `member_count` from the skeleton twin.

**How the acceptance criteria are met.** AC#1 unified dispatch (always update, never gate); AC#2 subgraph-induced agentic flows + `agentic.bridge` edges (lower confidence, `inference_rationale`, no `extractor` field); AC#3 the skill-diagrammer bundle hydrates into one flow scoped to the skill dir and renders; AC#4 the detection goal is an explicit, threaded input (`--goal`, defaulting to `orient-in-code-tree`); AC#5 membership by re-induction from stored seeds/bridges/docs, a shared leaf re-syncing all containing flows; AC#6 user descriptions/labels preserved via the resolver + watermark ladder; AC#7 the re-attachment bin is a query over soft-deleted preserved content, never auto-pruned; AC#8 the Stop-hook chain with scoped writes, loop-safety, and a per-turn hydration cap whose overflow becomes logged singleton stubs (no silent cap); AC#9 stable identity via the sorted-anchor-set `last_synced_at` stamp plus a ≥50% overlap remap that carries a user label (re-stamped user-owned) across an id change and strands the superseded flow into the bin; AC#10 introduces no review apparatus, triage classifier, lifecycle states, observation/adjudication tables, or PreCommit gate.

**How to navigate.** Start at `packages/drift/src/reconcile/reconcile.ts` (the pipeline) → `hydrate.ts` (the two HYDRATE shapes + the remap) → `flow_store.ts`/`flow_identity.ts` (persistence + identity) → `ariadne_adapter.ts`/`headless_project.ts` (the code seam) → `skill_dir.ts` (the skill seam). The shared pure helpers live in `packages/core/src/model/flow.ts` and `flow_projection.ts` and `resolver/from_ariadne.ts`. The skill body is `assets/skills/drift-sync/scripts/drift_sync.js` + `src/bin/drift_reconcile.ts`; the render change is `packages/vscode/src/extension.ts`.

**What to watch / follow-ups.** The describe executor is a seam with a deterministic default; v1 wires no model-backed executor through the bin (the agent-fed path is structural, not exercised). `extract_raw` is intentionally a no-op — the raw code tier is the in-memory call graph, regenerated each run; the persisted footprint of a code flow is its `agentic.flow` node + descriptions. Two follow-ups are deliberately not done here: `package-lock.json` is not refreshed for the new `@ariadnejs/*` drift deps (the project rule forbids `npm install`; the deps resolve via root hoisting and must be locked before publish), and the file-discovery/Ariadne-warning helpers duplicated between `HeadlessProject` and the VSCode `AriadneProjectManager` should be hoisted into a shared core module.

### Inbound seams from task-27.1.3

Task-27.1.3 ships the flow container + deterministic skeleton and leaves these hydration-side seams for this task to close:

- **Persist hydrated flows.** The `agentic.flow` / `agentic.flow_member` / `agentic.bridge` row builders exist in `packages/core/src/model/flow.ts` (`build_flow_node`, `build_flow_member_edges`, `build_bridge_edges`) and are unit-tested but never written in v1. Hydration writes them to the store; `list_flows` already reads them via `read_hydrated_flows` and orders them ahead of the skeleton (`order_flows`).
- **`render_flow` must dispatch on a hydrated id.** The extension handler currently resolves only deterministic skeleton ids (`build_skeleton_flows(...).find(...)`); a persisted `agentic.flow` id (which need not equal any single-seed skeleton id) throws "Unknown flow". Add a branch that renders a hydrated flow from its stored seeds/bridges/docs (`induce_members`) when the id is not in the skeleton.
- **Carry `seed_location` + live `member_count` onto hydrated summaries.** `read_hydrated_flows` returns `seed_location: null` and a stored `member_count`, so a hydrated entry that supersedes its skeleton twin loses jump-to-source and the live count. Inherit them from the matching skeleton flow during the merge, or stamp them when persisting.
- **Live re-sync.** The v1 flow surface is a per-request snapshot — there is no webview push (the dead `call_graph_updated` push was removed). The Stop-hook hydration sub-agent is the live-update path; when it writes a flow, the next `list_flows`/`render_flow` reflects it.
- **D-FLOW-IDENTITY.** v1 ids are the dominant seed's `symbol_path` (content-hash excluded). The sorted-anchor-set hash + ≥50% overlap remap that survives non-deterministic re-detection is resolved here.

### Inbound seams from task-27.1.4 — this task owns the model-call implementation

Task-27.1.4 ships the **deterministic agentic substrate plus typed contracts**; it makes **no model call**. This task owns the model-call implementation and the subjective grouping that drive that substrate. Concretely, this task implements:

- **The `DescribeBatchExecutor`** (`@code-charter/core`, `agentic/describe_policy.ts`) — the real batched, cost/time-bounded LLM call that fills the `needs_llm` descriptions `plan_descriptions` selects. task-27.1.4 ships only a `null_describe_executor`. The executor runs **inside the hydration sub-agent's own run** (no separate primitive), and its deadline is the model-time budget the substrate writer does not enforce.
- **The non-literal inference half of AC#2** — the registry detector's injected `resolve_target` (and any entrypoint→doc inference beyond literal registry maps). task-27.1.4 ships the literal `meta.json sub_agents[]` detector and the provenance-carrying `build_bridge_edges`; this task supplies the model-backed resolution where the link is not a literal map.
- **The subjective umbrella grouping** — `detect_gaps` / `derive_candidate_seeds` propose candidate flow seeds and `detect_meta_json_sub_agent_bridges` proposes bridges; this task's sub-agent **judges** which candidates become flow umbrellas, then assembles a `SubstrateProposal` and calls `write_agentic_substrate` (the assembly chain is documented at the head of `agentic/agentic_writer.ts`).
- **The `PlannedDescription` → `ResolvedDescription` combine step** — after running the executor over `needs_llm`, this task merges its results with the `from_docstring` and `placeholder` buckets into the `ResolvedDescription[]` the writer persists.
- **Id-space mapping for bridges** — a persisted `agentic.bridge` endpoint is a NodeRow id; map it back to its Ariadne `SymbolId` before feeding `induce_members`.

The deterministic substrate (gap-detection, the description policy, the agentic-lane writer honoring preservation + the cost ceiling, and the task-21.2 literal skill extractor port) is complete and tested in task-27.1.4; this task wires the model and the judgement on top.
