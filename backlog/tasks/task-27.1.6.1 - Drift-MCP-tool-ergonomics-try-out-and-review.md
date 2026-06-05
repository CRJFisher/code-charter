---
id: TASK-27.1.6.1
title: "Drift MCP tool ergonomics: try-out and review (drift.list / drift.resolve)"
status: Done
assignee: []
created_date: "2026-06-02"
labels:
  - mcp
  - ux
  - drift
  - review
  - hooks
parent_task_id: TASK-27.1.6
dependencies:
  - task-27.1.1
  - task-27.1.6
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
  - backlog/tasks/task-27.1.1 - Drift-infrastructure-substrate-MCP-agent-harness-hook-installer.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The user-facing code→diagram resolution path is the `drift.*` MCP surface shipped by task-27.1.1: `drift.list(scope?)` reads the re-attachment bin (user-authored and agentic content stranded from the code it described) and `drift.resolve(id, resolution)` reattaches or deletes a bin entry. These tools are built and unit-tested against the store contract, but their **ergonomics are unproven** — nobody has driven them in a real session to recover a genuinely stranded description after a rename/split. The shape may not be the right surface: the `drift_list`/`drift_resolve` naming, the bare-`id` addressing (a node id vs an edge key, resting on an unenforced disjointness assumption), the `reattach`/`delete` vocabulary, how a user or agent discovers outstanding drift and loops through it, and how much each tool returns to make a confident choice are all guesses until exercised.

This task waits until the first release lands. task-27.1.6 (the v1 ship point) is where the `Stop`-hook auto-sync actually produces re-attachment-bin entries in real use, so only then is there a genuine stranding to resolve. It sequences **after task-27.1.6 and before task-27.1.7** and gates nothing on the critical path — it is a deliberate "come back and review the surface once it is real" task. Scope is try-out + review + a keep/revise/replace decision; any revision small enough lands here, anything larger spins a concrete follow-up.

The review also covers the **`Stop`-hook trigger UX**, exercised live during task-27.1.6 dogfooding. The hook decides what to reconcile from the transcript's edited files; two rough edges surfaced. First, it blocks for **any** edited file — including docs/config (`.md`, `.json`, `.gitignore`) that can never produce a flow — so a doc/config-only turn still prompts a (full-repo, currently uncached) reconcile that no-ops. Second, v1 only forms flows two ways: a **skill directory** (`ingest_skill` links `SKILL.md` → scripts/references via markdown links and `meta.json sub_agents[]` → sub-agents) and a **code entrypoint tree** (the Ariadne call graph). A **standalone doc** — a new `.md` that is neither inside a skill bundle nor referenced by code — therefore maps to **no flow at all**, yet the hook still fires for it with nothing to reconcile. The open question is what an unconnected edit should do: most likely log-and-skip without blocking (the hook pre-filtering its file set to flow-relevant paths), versus eventually giving standalone docs a place in a flow (doc nodes / doc↔code linkage). The per-turn re-fire flood is already fixed (the transcript watermark, commit `cb51e03`); what remains is *which* edits should trigger a reconcile at all.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Drive `drift.list` and `drift.resolve` end-to-end in a real Claude Code session against a **genuine re-attachment-bin entry** — one produced by a rename/split that strands a user-authored description (the task-27.1.2 milestone scenario) — discovering it via `drift.list`, reattaching it to the new symbol via `drift.resolve`, and confirming the authored content carries across
- [x] #2 Evaluate the ergonomics across: tool **naming** (`drift_list`/`drift_resolve` vs the `drift.*` concept); the **`id`-only addressing** (node id vs edge key, and whether the disjointness assumption needs a `kind` disambiguator); the **`reattach`/`delete`** resolution vocabulary; **discoverability** (the `SessionStart` banner → `drift.list` → `drift.resolve` loop a user/agent actually follows); and the **richness of the returned payload** — is `drift.list`'s output enough to choose a target with confidence, and is `drift.resolve`'s result/no-op feedback clear?
- [x] #3 Decide and document: **keep / revise / replace**. If revising, name the concrete change (e.g. a richer `drift.list` payload with the stranded content + candidate targets, a `kind` disambiguator on resolve, a "resolve-next" affordance, clearer naming) and either apply it here if small or spec it as a follow-up
- [x] #4 Confirm the invariants still hold after any change: the `drift.*` surface stays **user-facing only** (no reconcile-via-MCP creep — reconciliation remains the `Stop`-hook → sub-agent → `drift-sync` path), and the surface stays **additive to task-27.0's reservations** (no new table, no schema migration)
- [x] #5 **Stop-hook trigger filtering:** the hook should not block (nor launch the reconciler) for an edited file that maps to no flow. Pre-filter the transcript's `worked_on` set to flow-relevant paths — supported source extensions, or files under a skill dir — in `transcript_parser`/`stop_decision`, and decide whether a non-flow edit is silently logged-and-skipped or surfaced read-only (it must not gate the turn with a no-op reconcile). Layers on the per-turn watermark already shipped (commit `cb51e03`)
- [x] #6 **Standalone-doc scope:** v1 forms flows only for skill directories and code entrypoint trees, so a standalone `.md`/doc (not in a skill, not code-referenced) belongs to no flow. Decide and document whether such an edit is (a) ignored/logged and never blocks, or (b) given handling (doc nodes + doc↔code linkage) so it can join a flow — today the hook fires for it with nothing to reconcile

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Reproduce a real stranding: run the task-27.1.2 rename milestone so the auto-sync leaves a user-authored description in the re-attachment bin.
2. Walk the recovery loop as a user would — `SessionStart` banner → `drift.list` → pick → `drift.resolve(reattach)` — and as an agent would (the tools called programmatically), noting every point of friction.
3. Score the ergonomics dimensions in AC#2; capture concrete pain points, not taste.
4. Decide keep/revise/replace (AC#3); apply a small revision in place or open a follow-up for a larger one.
5. Re-confirm the user-facing-only and additive-to-27.0 invariants (AC#4).
6. **Hook trigger UX (AC#5/#6):** review what the `Stop` hook fires for. Add a flow-relevance pre-filter to `worked_on` (supported source / skill-dir membership) so doc/config-only turns don't trigger a no-op reconcile; decide the standalone-doc behaviour (ignore-and-log vs give docs a flow). Small filter lands here; larger doc-flow support spins a follow-up.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

**Why this exists.** The `drift.*` MCP surface (`drift.list` / `drift.resolve`) is the user-facing way to recover a hand-written description that drift stranded from the code it described. task-27.1.6 shipped the auto-sync that produces those strandings, so this task is the first time the recovery surface — and the `Stop`-hook trigger that drives reconciliation — are driven against real strandings rather than unit fixtures, with a keep/revise/replace verdict as the deliverable.

**The decision (keep / revise / replace).** The surface is **kept**. The `drift_list`/`drift_resolve` naming is correct (the underscore is forced by MCP's `mcp__server__tool` flattening); the `reattach`/`delete`/`reanchor` vocabulary is sound; and the surface has already outgrown the original two-verb premise — `reanchor` exists and commits a staged relocation onto a renamed symbol, with the `SessionStart` banner pointing at it. One **revision** lands here: `drift.list`'s payload was too thin to choose a recovery target with confidence, so each bin entry now carries the stranded authored content. The larger recovery gaps are **spun as follow-ups**: re-pointing a missed description onto a *new* symbol, candidate-target suggestions, a resolution-kind disambiguator, and a resolve-next affordance go to task-27.1.6.3. Giving standalone docs their own flow (option (b)) was considered and **dropped** — the value did not justify the doc-node + doc↔code-linkage machinery — so option (a) (ignore-and-log) is the final behavior for standalone docs.

**What shipped here.** Two focused code changes plus the recovery exercise:

- **The `Stop`-hook flow-relevance pre-filter.** Before deciding to block, the hook now drops this turn's edited files that cannot form a flow — anything that is neither a supported source nor a file under a `SKILL.md` ancestor. A turn that edited only docs/config falls to empty and the no-new-drift guard no-ops it, instead of launching a full-repo reconcile the engine would discard anyway. This is AC#6's standalone-doc decision (ignore-and-skip) falling out of the AC#5 filter, layered on the per-turn watermark. The watermark still advances over the full edited set, so a dropped file is never re-considered.
- **The richer `drift.list` payload.** Bin entries gain the stranded `description` text, the row's `node_kind`, a `user_authored` flag, and `intent_source` — read off the soft-deleted row already in hand, so the change is additive with no schema migration. A chooser (human or agent) now sees what they are about to recover and whether it was hand-authored.
- **A genuine-miss recovery exercise** drives `drift.list` → `drift.resolve {reattach}` against a real resolver miss (a rename that also rewrites the body, so the anchor resolves nowhere and the description is binned), confirming the authored content survives the round-trip; a copy-paste dogfooding walkthrough (`packages/drift/assets/dogfood-drift-recovery.md`) covers the live banner → list → resolve loop.

**How to navigate.** The trigger filter is `packages/drift/src/reconcile/flow_relevance.ts`, wired into `packages/drift/src/bin/drift_stop_hook.ts` (between the watermark advance and `decide_stop_action`, which stays pure). The recovery surface is `packages/drift/src/mcp/re_attachment_bin.ts` (the enriched bin query) and `drift_tool.ts` (the handlers); the recovery exercise is in `drift_tool.test.ts`.

**What to know.** `reattach` restores a missed description onto its *original* anchor — it does not re-point onto a new symbol; that is task-27.1.6.3, not a defect here. The flow-relevance union ("supported source OR under a skill dir") is intentionally duplicated between the pre-filter and the reconcile partition because the partition needs the skill-root *value*, not just a boolean; both bottom out on the same two helpers (`is_supported_source`, `find_skill_root`).

### Acceptance criteria outcomes

- **#1** — drove `drift.list` + `drift.resolve` against a genuine re-attachment-bin entry (a real resolver miss from a rename-and-rewrite), recovered it via `reattach`, and confirmed the authored content carries across (`drift_tool.test.ts`); the live-session loop is captured in the dogfooding walkthrough.
- **#2** — ergonomics scored: naming **keep**; `id`-only addressing **flagged** (the node-id/edge-key disjointness assumption → a `kind` disambiguator in task-27.1.6.3); `reattach`/`delete`/`reanchor` vocabulary **keep**; discoverability (banner → `drift.list` → `drift.resolve`) **keep**; the returned payload was **too thin** → enriched here.
- **#3** — **keep + one revision (the payload enrichment) + one follow-up** (task-27.1.6.3 richer recovery). Standalone-doc flows (option (b)) were considered and dropped; option (a) is final.
- **#4** — invariants hold: the surface stays user-facing-only (reconciliation remains the `Stop`-hook → sub-agent → `drift-sync` path; the filter only narrows what the hook hands the reconciler) and additive to task-27.0 (no new table, no migration — the new fields read off existing columns).
- **#5** — the flow-relevance pre-filter ships, layered on the per-turn watermark.
- **#6** — standalone docs take option (a): ignored and logged, never gating a turn. Option (b) (doc nodes + doc↔code linkage) was considered and dropped — option (a) is final.

**Field observations (task-27.1.6 live dogfooding):**

- The `Stop` hook fired every turn re-listing the *whole session's* cumulative edits with no way to clear it — an unsatisfiable loop. Root cause: it judged drift from the entire transcript and only no-op'd on zero edits, while reconciliation writes SQLite (never the transcript). Fixed by a per-turn transcript watermark (commit `cb51e03`, task-27.1.1 area) — the hook now scopes to *this turn's* edits.
- Two hook-UX rough edges (AC#5/#6) surfaced and are addressed here: the hook blocked for non-flow files (a doc/config-only turn → a no-op full-repo reconcile), and a standalone new `.md` (this very task doc, e.g.) maps to no flow because v1 only forms skill-dir and code-entrypoint flows — so the hook fired with nothing to do. The flow-relevance pre-filter drops both; giving standalone docs their own flow was considered and dropped, so option (a) (ignore-and-log) is final.
- Cost interaction: each reconcile is a full-repo Ariadne index (uncached at `@ariadnejs/core@0.8.0`), which makes the "don't fire for non-flow edits" filter matter more — see the persistent-cache dependency noted on task-27.1.6.
- Separately, the re-sync mass-binned valid descriptions (anonymous `symbol_path` collisions emptying the resolver index) — captured as its own bug in task-27.1.6.2, not part of this UX review.

<!-- SECTION:NOTES:END -->
