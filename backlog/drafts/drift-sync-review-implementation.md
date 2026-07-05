# Drift Sync: Implementation Review

Evaluate the existing drift sync implementation — completeness, correctness, and efficacy. Key improvement areas ranked by impact.

## Executive Summary

The core pipeline is coherently wired and the deterministic reconcile engine is correct and unusually well-tested. The three structural weaknesses are: (1) a multi-process architecture with zero concurrency discipline producing silent dropped reconciles and potential staged-edit loss; (2) a missing final pipeline stage — nothing watches `graph.db`, so reconcile results never reach an open webview; (3) the agentic stitch phase is context-starved (the inventory hands the agent no semantic signal about reachable members) and its quality is measured only structurally, never for description quality. Test coverage is strong for deterministic paths but the two most judgement-critical modules (`agentic_modes.ts`, `affected_flows.ts`) have no dedicated unit tests.

## Strengths

- Clean deterministic/agentic split with a graph-corroboration evidence bar: `apply_stitch` rejects invented bridges unless corroborated by an unresolved call site in the live graph — the agent can propose but not fabricate structure
- Scoped-upsert write model (`flow_store.write_flow`, `re_extract`) never does a store-global rebuild, preserving other flows' agentic content; writes are idempotent and deterministic
- Careful within-process retirement discipline: deferred retirement when the graph is untrustworthy (empty graph, omitted seed file, zero-symbol parse), resurrection guards, and double-retire race defenses
- Rename-stable `symbol_path` anchor identity and a disciplined path-normalization funnel (`paths.ts`) across the hook → reconcile → store chain
- Unusually strong test coverage for deterministic paths: every hooks-layer and installer module has dedicated unit tests, and the delta/membership/code/stitch integration suites use real filesystems, real SQLite, and a real headless Ariadne pipeline
- The two-tier eval design (Tier 1 golden-wire structural + Tier 2 live `stitch_eval` with scaffolded fixture repos) is the right shape for measuring agentic judgement
- Error handling correctly prioritizes never breaking the host Claude session (hook exits 0 on any failure)

## Critical Risks

- **DATA LOSS**: the pending-reconcile consume race — edits staged during a long-running reconcile are deleted by `drift_sync.js`'s post-success unlink and never reconciled until re-edited; combined with the already-advanced watermark there is no cursor to recover them
- **SILENT DROPPED SYNCS**: `SQLITE_BUSY` under concurrent hook/reconcile/webview access (no WAL/busy_timeout) causes `drift-reconcile` to exit 1 without consuming the pending set — the reconcile silently never completes and nothing records the attempt
- **SILENTLY STALE DESCRIPTIONS**: `body_modified_member_ids` silently drops any `delta.modified` symbol_path that fails the `anchored_symbols` join (the known two-id-space seam) — a pure body edit to such a member fires no re-sync and no diagnostic
- **LIVE-STORE ANOMALY ALREADY PRESENT**: the bergamot store has 34 flows and a `stitch.json` beside the DB but ZERO `agentic.bridge` edges and only 1 `flow_member` edge — possibly a real stitch-persistence regression; no tooling exists to even notice it
- **SILENT CLOBBER**: two concurrent reconcile processes built from different filesystem snapshots can interleave soft-deletes and re-hydrates of the same flow (last-writer-wins), diverging the store from true code state with no error
- **DEGRADED OVERWRITE**: a `SKILL.md` bundle read mid-edit (truncated file, transiently missing sub-agent file) is unconditionally re-ingested and wholesale-overwrites the skill flow with a shrunken snapshot — no deferral, no signal

## Top Improvements (Ranked)

### 1. [CRITICAL] SQLite concurrency discipline: WAL + busy_timeout, read-only extension connection, single-reconcile lock

**Root cause** flagged independently by two agents. `SqliteGraphStore` opens with only `PRAGMA foreign_keys=ON` — no WAL, no `busy_timeout` — while three uncoordinated actors touch `graph.db`: the Stop-hook-launched reconcile subprocess (writer), a possible concurrent manual `/drift` reconcile (second writer, last-writer-wins clobber), and the VS Code extension (opens read-write, reads nodes and edges in two separate statements so it can see torn state). Under the default rollback journal, contention throws `SQLITE_BUSY` instantly: `drift_reconcile.ts` exits 1 so the pending set is never consumed (a silently dropped reconcile).

**Actions:**

- In `SqliteGraphStore` constructor (`packages/core/src/storage/sqlite_graph_store.ts:38-42`), set `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` immediately after open
- Open the extension's store connection read-only (`extension.ts read_store_rows` never writes) so it never competes for the write lock; wrap the nodes+edges fetch in one read transaction for a consistent snapshot
- Add a process-level reconcile mutex beside the store (O_EXCL `wx` lockfile in `.code-charter/` or `BEGIN IMMEDIATE` advisory row); a second reconcile waits or exits 0 as a no-op since its files are already unioned into the pending set

**Files:** `packages/core/src/storage/sqlite_graph_store.ts`, `packages/vscode/src/extension.ts`, `packages/drift/src/bin/drift_reconcile.ts`, `packages/drift/src/reconcile/reconcile.ts`

---

### 2. [HIGH] Close the missing final pipeline stage: graph.db change → webview refresh

The pipeline's stated contract ends in "flow store update → UI notification", but that link was never built. `extension.ts` reads the store only on demand inside `list_flows`/`render_flow` handlers; `AriadneProjectManager.on_call_graph_changed` exists but is never subscribed; `UIDevWatcher` watches only the UI bundle. So stitched umbrellas and LLM descriptions landing in `graph.db` out-of-process are invisible until the user manually re-runs Generate Diagram. The debounced-watcher pattern already exists in `dev_watcher.ts`.

**Actions:**

- Add a `vscode.FileSystemWatcher` on `<workspace>/.code-charter/graph.db`, debounced with `UIDevWatcher`'s settle logic, that posts a `store_changed` message so the webview re-runs `list_flows`/`render_flow`
- Invalidate project_manager's cached call graph on the same event so a reconciled code change is reflected without disposing the panel
- Keep the store open-per-request model; the watcher only triggers a re-read

**Files:** `packages/vscode/src/extension.ts`, `packages/vscode/src/dev_watcher.ts`, `packages/vscode/src/ariadne/project_manager.ts`

---

### 3. [HIGH] Make the pending-reconcile handoff atomic

Two independently-reported data-loss windows share one root: (a) **Consume race** — `drift_sync.js` unlinks `drift_pending_reconcile.json` only after a successful reconcile; a Stop fire that stages new edits during a long-running reconcile has its union deleted by that unlink. (b) **Watermark divergence** — `drift_stop_hook.ts` advances the transcript cursor on every fire regardless of whether the sub-agent launches or succeeds; if the pending file is lost the edits are permanently skipped.

**Actions:**

- Have the reconciler rename the pending file to a private working name (atomic on same filesystem) BEFORE starting; delete on success, union back on failure
- Write the pending file via temp-file + atomic rename in both `drift_stop_hook.ts` and `drift_sync.js`
- Advance the watermark only after the staged set is durably written
- Add a cross-check test that writes via `serialize_pending_reconcile` (TS) and consumes via `drift_sync.js` (duplicated JS parser) to guard against format divergence

**Files:** `packages/drift/src/hooks/pending_reconcile.ts`, `packages/drift/src/bin/drift_stop_hook.ts`, `packages/drift/src/hooks/stop_watermark.ts`, `packages/drift/assets/skills/drift-sync/scripts/drift_sync.js`

---

### 4. [HIGH] Enrich the stitch inventory with semantic context

`build_entrypoint_inventory` emits only `symbol_path`/name/file/line/`is_orphan`/`unresolved_sites` per entrypoint, discarding the member names, docstrings, and existing description nodes its `reachable_from` walk already touches. Stitching is a semantic-similarity judgement, yet the agent gets zero semantic signal and must reconstruct everything via Read/Grep — exactly where the cost-tuned haiku default under-stitches, and under-stitching reads as "correct, no gap" (silent quality loss).

**Actions:**

- Extend `InventoryEntrypoint` in `agentic_modes.ts` with `members: [{name, kind, docstring_first_line?}]` from the existing `reachable_from` walk, plus each member's existing description text where present
- Update `SKILL.md` phase-1 guidance to rank candidates by name/description similarity first, then confirm top candidates by reading the call site
- Report per-flow described-coverage (placeholder vs llm counts) in the list-entrypoints output

**Files:** `packages/drift/src/reconcile/agentic_modes.ts`, `packages/drift/assets/skills/drift-sync/SKILL.md`, `packages/core/src/agentic/gap_detection.ts`

---

### 5. [HIGH] Persist a reconcile run log

`FlowOutcome`, `DeferredRetirement`, hydration-cap notices, and stitch skip reasons are serialized to stderr — which lands in the Claude session transcript, a different process — and then discarded. Nothing in `graph.db` can answer "why did flow X get retired?", "why was retirement deferred and did it ever complete?", or "which file set drove the last sync?".

**Actions:**

- Append per turn to a JSONL sidecar (`drift_reconcile_log.jsonl` beside `graph.db`) or a disposable `reconcile_log` table: timestamp, file set, per-flow action + reason, deferred retirements with reasons, placeholder-vs-llm description counts
- Include a last-attempt/last-success/last-error sync-status record so a silently dropped or failed reconcile is distinguishable from "nothing changed"
- Log when a `delta.modified` symbol_path fails to resolve in `body_modified_member_ids`

**Files:** `packages/drift/src/reconcile/types.ts`, `packages/drift/src/reconcile/reconcile.ts`, `packages/drift/src/bin/drift_reconcile.ts`

---

### 6. [MEDIUM] Unit-test agentic_modes.ts and affected_flows.ts

`agentic_modes.ts` is the entire agent-facing write surface and `affected_flows.ts` is the membership/body-drift trigger core — a false negative there is precisely the stale-drift the mechanism exists to prevent, and it fails silently. Neither has a dedicated test; both are exercised only through slow built-bin subprocess suites.

**Actions:**

- Add `agentic_modes.test.ts`: parse/apply per contract-breach shape, bridge-endpoint-not-in-graph skip, unresolved call span corroboration, `apply_descriptions` last-wins duplicate collapse — against an in-memory store and hand-built `CallGraph`
- Add `affected_flows.test.ts`: body-drift only, membership-drift only, both, neither, missing `anchor_set` self-heal, both zero-seed shapes

**Files:** `packages/drift/src/reconcile/agentic_modes.ts`, `packages/drift/src/reconcile/affected_flows.ts`

---

### 7. [MEDIUM] Harden reconcile against partial/degraded writes

Three related soft-integrity gaps: (a) `reconcile()` issues many independent store mutations with no turn-spanning transaction, so a mid-turn crash leaves half a turn applied; (b) the skill path lacks code path's deferred-retirement guards — a mid-edit truncated `SKILL.md` is unconditionally re-ingested and overwrites the flow with a degraded snapshot; (c) placeholder descriptions are written expecting the apply-descriptions pass to overwrite them, but nothing guarantees that pass runs.

**Files:** `packages/drift/src/reconcile/reconcile.ts`, `packages/drift/src/reconcile/skill_dir.ts`, `packages/drift/src/reconcile/describe.ts`

---

### 8. [MEDIUM] Resolve test-entrypoint asymmetry and add stale-flow sweep

`build_skeleton_flows` hydrates test-file entrypoints as singleton flows, but `build_entrypoint_inventory` and `find_orphan_entrypoints` both skip `is_test` — so test-rooted flows are persisted yet invisible to the agent, un-stitchable and un-retirable clutter. Skill flows appear to have NO retirement path at all — deleting a `SKILL.md` leaves the flow live.

**Files:** `packages/drift/src/reconcile/reconcile.ts`, `packages/core/src/model/flow.ts`, `packages/drift/src/reconcile/affected_flows.ts`

## Cross-Cutting Themes

- **Silence-by-design is the shared root cause**: the hook exits 0 on any error, installs swallow exceptions, joins silently narrow, tasks run silent, stderr lands in a different process. The single persisted run-log/sync-status record fixes findings in both goals at once.
- **Multi-process architecture with zero concurrency discipline**: three actors share `graph.db` and `drift_pending_reconcile.json` with no WAL, no busy_timeout, no lockfile, and non-atomic JSON writes.
- **Duplicated contracts and two-id-space seams**: `drift_sync.js` re-implements `pending_reconcile.ts`'s format; delta symbol_paths join against `anchored_symbols` in a different id shape; the watermark and pending set are two independent "processed?" records that can diverge.
- **The agentic layer is under-fed and under-measured**: the stitch inventory strips all semantic context the walk already computed, the eval scores structure but never description quality, and placeholder descriptions persist invisibly.
