---
id: TASK-27.1.17
title: >-
  Entrypoint work list: serve the drift-reconciler one entrypoint at a time and
  drain across turns
status: To Do
assignee: []
created_date: "2026-06-12 10:06"
labels:
  - drift
  - hooks
  - sub-agents
  - skills
dependencies:
  - task-27.1.6.6
references:
  - packages/drift/src/bin/drift_stop_hook.ts
  - packages/drift/src/hooks/stop_decision.ts
  - packages/drift/src/hooks/pending_reconcile.ts
  - packages/drift/src/reconcile/agentic_modes.ts
  - packages/drift/src/bin/drift_reconcile.ts
  - packages/drift/assets/skills/drift-sync/scripts/drift_sync.js
  - packages/drift/assets/skills/drift-sync/SKILL.md
  - packages/drift/assets/agents/drift-reconciler.md
parent_task_id: TASK-27.1
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

**The overload.** A heavy editing turn (or several declined/failed turns unioned into the pending file) hands `--list-entrypoints` a large changed set, and the drift-reconciler receives the _entire_ entrypoint inventory in one shot. The inventory JSON itself is cheap; the judgement is not — each entrypoint costs Read/Grep exploration from both ends of its missing edges, so context fills linearly and stitch quality decays exactly when the inventory is largest. Two structural gaps compound it: judgement state lives only in the agent's context (a crash after judging 15 of 20 entrypoints loses all 15 — one big `stitch.json` is applied only at the end), and the hook's no-new-drift guard means work left unfinished can never be picked up on a later idle turn.

**Direction: a persisted entrypoint work list, popped one item at a time.** The file-level pending set already behaves as a work list (staged, unioned, consumed-on-success); this task adds the same discipline one level down, at the granularity the agent actually works in.

New artifact `drift_entrypoint_worklist.json` beside the store (with the pending file and watermark):

- `items` — the judgement-needing entrypoints: orphans ∪ entrypoints with `unresolved_sites`, full inventory shape.
- `context_entrypoints` — the rest of the changed-neighbourhood inventory (doc-linked, no sites): stitch _targets_ the agent may cite as seeds, never work to investigate.

Ownership splits along the existing bin/script line:

- **The bin owns merges and prunes** (it holds the live graph, so it can do them correctly). `--list-entrypoints`: after the deterministic reconcile, merge the fresh inventory into the work list (keyed by `symbol_path`, fresh entry wins, prior-turn items kept), prune items whose symbol no longer resolves, and emit a compact digest on stdout — per entrypoint `{ symbol_path, name, is_orphan, site_count }` plus a `pending` count — instead of the full inventory. The agent gets the map for grouping judgement without the bulk. `--apply-stitch`: additionally remove the _successfully resolved_ seeds of applied umbrellas from the work list (a seed skipped as unknown must stay pending — only the bin knows which is which). `--dry-run` never touches the work list. New module `packages/drift/src/reconcile/worklist.ts` (parse/serialize/merge/prune + path helper), shared with the hook bin.
- **The skill script owns the pop.** New `drift_sync.js --next-entrypoint`: pop the head item, write back the remainder, print `{ item, candidates, remaining }` (candidates = remaining items + `context_entrypoints`, names only). Pure JSON read-modify-write — no bin spawn, no per-item graph rebuild. Empty list → `{ item: null, remaining: 0 }`. The format constant is mirrored into the script the way `PENDING_RECONCILE_FILE` already is. Pop-on-read is deliberate: a crash mid-item drops that one item to the deterministic singleton floor (fragmented-but-honest), rather than buying a claim/complete/timeout protocol.

**The hook drains leftovers on idle turns.** `decide_stop_action` gains the work-list pending count: block when `stop_hook_active` is false AND (relevant edits this turn OR work list non-empty). A turn that edits nothing but follows an incomplete drain re-launches the reconciler with a fresh context. Loop safety is unchanged — the `stop_hook_active` guard still kills same-turn loops, and cross-turn re-fires each require a user turn in between and shrink the list monotonically. `build_system_message` reports both counts.

**The skill loop interleaves the phases per item.** SKILL.md Phase 1 becomes: list (digest) → loop `--next-entrypoint` → judge that one item alone → if it connects, apply a single-umbrella `stitch.json` _now_ and describe that flow's members _now_ → next item; until `item: null` or a soft cap (~10 items/launch, prompt-level guidance — enforcing it in the script would need cross-invocation run state, YAGNI). Per-group apply makes judgement durable incrementally; the cost is more bin spawns per launch, bounded by the cap, with the remainder draining on subsequent turns. The ack line gains the remaining count.

Out of scope: concurrent sessions racing on the pop's read-modify-write — the pending file already carries the same exposure; noted, not solved here.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 `--list-entrypoints` writes/merges `drift_entrypoint_worklist.json` beside the store (items = orphans ∪ has-unresolved-sites; the rest persist as `context_entrypoints`), prunes entries whose symbol no longer resolves in the live graph, and emits the compact digest + pending count on stdout instead of the full inventory. `--dry-run` leaves the work list untouched.
- [ ] #2 `drift_sync.js --next-entrypoint` pops exactly one item per call and returns `{ item, candidates, remaining }` without spawning the bin; an empty work list returns `{ item: null, remaining: 0 }` and exits 0.
- [ ] #3 `--apply-stitch` removes only the successfully resolved seeds of applied umbrellas from the work list; seeds skipped with a diagnostic stay pending.
- [ ] #4 The Stop hook blocks on a turn with no new edits when the work list is non-empty, and the drain converges: repeated fires shrink the list until an idle turn with an empty work list no-ops. `stop_hook_active` still guards same-turn loops.
- [ ] #5 SKILL.md and drift-reconciler.md describe the per-item loop (pop → judge → apply-stitch → describe, soft cap ~10/launch) and the ack line names the remaining count; the installed `.claude/` copies are refreshed.
- [ ] #6 Incremental durability is proven: an e2e (or contract-level) test drains a multi-fragment fixture across two launches — stitches applied in launch one persist, launch two picks up only the remainder.
- [ ] #7 Comprehension docs (`flow-construction.html`, `drift-sync.html`) show the work-list file in the swimlane and add the fifth guarantee: an interrupted drain resumes on a later turn.

<!-- AC:END -->
