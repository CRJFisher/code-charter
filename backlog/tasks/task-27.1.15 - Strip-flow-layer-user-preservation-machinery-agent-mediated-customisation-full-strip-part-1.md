---
id: TASK-27.1.15
title: >-
  Strip flow-layer user-preservation machinery (agent-mediated customisation,
  full strip part 1)
status: Done
assignee: []
created_date: "2026-06-09 15:14"
labels:
  - drift
  - flows
  - graph-db
  - simplification
dependencies:
  - TASK-27.1.6
references:
  - task-27.1.6.2
  - task-27.1.6.3
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
parent_task_id: TASK-27.1
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

At the flow layer, node descriptions are agent-generated at flow creation; the layer has no user-customisable fields. Customisation at the higher flow-chart layer is agent-mediated too — the agent authors and re-applies it, the way the `describe` seam regenerates descriptions — so no layer holds direct human byte-edits that an agentic pass must not overwrite.

The user-preservation and recovery apparatus built across task 27.1 therefore protects a state that cannot occur: the flow-layer `user`-tier writes, the ≥50%-overlap identity remap (whose sole job is carrying a user label/pin across an id change), the re-attachment bin, the drift recovery MCP tools (`drift.list`/`drift.next`/`drift.resolve`), and the SessionStart bin banner. This task removes that surface.

This is **part 1 of the full strip** — the flow layer plus the recovery-product surface. Part 2 (task-27.1.15.1) removes the core relocation/`reanchor` accept-dance.

Kept untouched: the `anchor_set` membership snapshot (drives membership-drift re-sync), the content-hash re-describe skip (a cost guard, not preservation), and the core `user` tier / field-ladder / resolver / `re_extract` reconcile primitives. The footgun this exposes — `write_descriptions` skips writing onto a binned (soft-deleted) node "for drift.resolve" — is fixed so a stranded agentic description is resurrected/regenerated rather than lost.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 The flow layer makes no `user`-tier writes: remove `restamp_carried_label`, `RemapResult.label`, the carried-label half of `apply_remap` (hydrate.ts), and the `existing.layer !== 'user'` branch in `write_flow` (flow_store.ts:79-97 → unconditional `upsert_node`). Grep confirms zero `write_fields(...,'user')` remain in packages/drift.
- [x] #2 Delete the overlap-remap identity machinery — `match_existing_flow`, `jaccard`, `REMAP_OVERLAP_THRESHOLD`, `FlowMatch` (flow_identity.ts) and the `allow_remap` option. Flow id stays the dominant seed's `symbol_path`; a superseded flow (renamed/removed dominant seed) is retired by the existing seed-gone soft-delete in `resync_persisted_flow`. Verify that path covers the cases the remap covered.
- [x] #3 Remove the write-only `anchor_set_hash` (no reader found; verify no webview/render consumer first). Keep the `anchor_set` array — it drives membership-drift re-sync in `affected_flows.ts` and is not user content.
- [x] #4 Remove the re-attachment bin and its recovery surface: the `re_attachment_bin` module and the now-dead core `rank_candidates`; the `drift.list`/`drift.next` MCP tools and the `reattach`/`delete` arms of `drift.resolve`, with their `build_drift_server` registrations and `tool_names` entries; the SessionStart bin banner.
- [x] #5 Strip the user-preservation half of `write_descriptions` (the `layer !== 'user'` guard → unconditional agentic upsert) and fix the footgun: the binned/soft-deleted skip no longer leaves content 'for drift.resolve' but resurrects/overwrites onto the live symbol, so a stranded agentic description is regenerated, never lost.
- [x] #6 Leave untouched: the content-hash re-describe skip (cost guard) and the core `user` tier / field-ladder / resolver / `re_extract` reconcile primitives (part 2 and the future agent-mediated layer concern).
- [x] #7 No backwards-compat shims — full removal with all callers and tests updated; tests covering only removed behaviour are deleted (e.g. `flow_identity.test.ts`, the 'carries a user label' case in `reconcile_code.test.ts`, the bin tests). Full suite green.
- [x] #8 The already-binned soft-deleted rows become unreachable: either add a one-time hard-delete cleanup of soft-deleted non-raw rows, or document leaving them orphaned (harmless once no query reads them).
<!-- AC:END -->

## Implementation Notes

## High-level summary

At the flow layer every node description is agent-generated, and higher-layer chart customisation is agent-mediated — the agent authors and re-applies it. No diagram layer holds direct human byte-edits that an agentic pass must avoid overwriting, so the user-preservation and recovery apparatus built across task 27.1 protects a state that cannot occur. This task removes that surface. It is part 1 of the full strip; part 2 (task-27.1.15.1) removes the core relocation/`reanchor` accept-dance.

One decision shapes the strip: flow identity stays the dominant seed's `symbol_path`, and a superseded flow (its dominant seed renamed or removed) is retired by the seed-gone soft-delete in `resync_persisted_flow` rather than carried across by an overlap remap. The ≥50% Jaccard overlap remap — whose only job was carrying a user label/pin across an id change — is deleted wholesale.

What changed, at altitude: the flow layer makes no `user`-tier writes (the carried-label restamp and `write_flow`'s user-promoted branch are gone; `write_flow` always upserts). The overlap-remap identity machinery (`flow_identity.ts`) and the write-only `anchor_set_hash` are deleted, while the `anchor_set` membership snapshot stays and still drives membership-drift re-sync. The re-attachment bin, the now-dead core `rank_candidates`, the `drift.list`/`drift.next` MCP tools and the `reattach`/`delete` arms of `drift.resolve`, and the session-start bin banner are removed — `drift.resolve` keeps only its `reanchor` arm. `write_descriptions` drops its user-preservation guard and binned-skip footgun: it always upserts the side-node live at the agentic tier, so a stranded agentic description is resurrected and regenerated, never left orphaned "for `drift.resolve`".

How to navigate the result: flow retirement spans two files — `affected_flows.ts` surfaces a seed-gone code flow as a re-sync candidate (distinguishing it from a skill/doc flow by its lack of enumerated member edges) and `reconcile.ts`'s `resync_persisted_flow` performs the soft-delete. The MCP surface is `drift_tool.ts` (a single `reanchor` handler) wired by `build_drift_server.ts`; the read-only relocation banner is `session_start_banner.ts`.

What to know / watch: the content-hash re-describe cost guard and the core `user` tier / field-ladder / resolver / `re_extract` reconcile primitives are deliberately untouched (part 2 and the future agent-mediated layer concern). A renamed flow whose file is not in a given turn's changed set is retired on a later reconcile and re-hydrates when its file is next touched — acceptable, because flow content is agent-regenerated, not preserved.

### How the acceptance criteria were addressed

- **#1** — `restamp_carried_label`, `RemapResult.label`, and the carried-label half of `apply_remap` are removed from `hydrate.ts`; `write_flow`'s `existing.layer !== 'user'` branch collapses to an unconditional `store.upsert_node`. Grep confirms zero `write_fields(...,'user')` in `packages/drift` production code. (One occurrence remains in `drift_tool.test.ts` — the reanchor milestone fixture, which exercises the kept relocation/`reanchor` accept-dance that part 2 removes; the staging-vs-auto-apply distinction is what requires a user-owned node there.)
- **#2** — `match_existing_flow`, `jaccard`, `REMAP_OVERLAP_THRESHOLD`, `FlowMatch` (`flow_identity.ts`, deleted) and the `allow_remap` option are removed. Flow id stays the dominant seed's `symbol_path`. The remap covered renames by carrying the user label across; with no user content at the flow layer, the seed-gone soft-delete in `resync_persisted_flow` covers the lifecycle (old retired, renamed entrypoint re-hydrates as a fresh flow). `affected_persisted_flows` was extended to surface seed-gone code flows into that path; verified by the rename test in `reconcile_code.test.ts`.
- **#3** — `anchor_set_hash` removed from `flow_identity.ts`, `WriteFlowArgs`, `write_flow`, both hydrate call sites, and the reconcile exports; no webview/render/core consumer existed. The `anchor_set` array is kept.
- **#4** — `re_attachment_bin.ts` (+ `re_attachment_bin_size`, `live_anchored_targets`), the core `rank_candidates`, `drift.list`/`drift.next`, the `reattach`/`delete` arms + `reattach_onto_target`, their `build_drift_server` registrations and `tool_names` constants, and the session-start bin banner are all removed.
- **#5** — `write_descriptions` is now an unconditional live upsert at `layer='agentic'` (`deleted_at: null`) then an agentic field write; the binned-skip and `layer !== 'user'` guard are gone and `WriteDescriptionsResult.skipped` (now always empty) is removed. A soft-deleted side-node is resurrected and overwritten.
- **#6** — the content-hash re-describe skip and the core `user` tier / field-ladder / resolver / `re_extract` reconcile primitives are untouched.
- **#7** — full removal with all callers updated, no shims. Tests covering only removed behaviour are deleted (`flow_identity.test.ts`, `re_attachment_bin.test.ts`, the bin/`reattach`/`delete`/`drift_next` blocks, the `reconcile_membership` re-attachment-bin block, the "carries a user label" case) or repurposed (the `reconcile_code` user-preservation test became a content-hash cost-guard test; the `write_descriptions` user/binned tests became a resurrect-overwrite test). `core` 258/258 and the `drift` suite green in isolation (the combined drift run shows only a pre-existing, unrelated `stop_decision` failure and a documented in-band Ariadne state-accumulation flake).
- **#8** — **Decision: leave the already-binned soft-deleted rows orphaned, no cleanup migration.** Once the bin query is removed nothing reads `deleted_at != null` non-raw rows (`outstanding_drift` and `read_persisted_flows` are live-only; the render fold drops tombstones unless `show_tombstones`, never set in production), so the rows are inert. A soft-deleted description side-node is resurrected by the next `write_descriptions`; a soft-deleted flow node stays orphaned and harmless. A one-time hard-delete would be surplus (YAGNI).

### Review follow-ups (not actioned here)

- `docs/comprehension/{flow-construction,drift-sync,core-engine,architecture}.html` still depict the deleted `rank_candidates.ts`/`flow_identity.ts`, the bin, and the Jaccard remap as live — and, after part 2 (task-27.1.15.1), also the removed drift MCP server / `drift.resolve` tool and the SessionStart banner — a follow-up doc-sync (four large HTML files, outside this strip's code scope).
- `re_extract.ts` comments still reference a "re-attachment bin"; the underlying miss soft-delete is part-2 territory (AC#6 keeps the primitive untouched), so the comment cleanup lands with part 2.
