# Drift Sync: Feedback Loop Review

Evaluate the debug/development feedback loop — how easy is it to run the extension in dev mode, inspect sync results, evaluate quality, and iterate? What tooling gaps exist?

## Executive Summary

The feedback loop is the weakest part of the system and the binding constraint on the current development phase. The deterministic engine has excellent tests and `stitch_eval.ts` is a genuinely good live quality harness — but everything between "I changed reconcile logic" and "I can see what the sync did to real data" is broken or missing. Reconcile diagnostics go to stderr in a Claude session that is a different process from VS Code; the extension has no OutputChannel; there is no store-inspection tool of any kind; the webview never refreshes after a sync; and the canonical developer docs describe a phantom three-package layout with files that do not exist, never mentioning drift, `graph.db`, or the reconcile loop.

The verified consequence: the live bergamot store contains a probable anomaly (0 bridge edges despite a `stitch.json`, 24 placeholder descriptions) that the developer has no tool to notice.

## Current Debug Workflow (7 Steps Across 3 Process Contexts)

1. Edit `packages/drift/src/reconcile/*.ts`
2. **Rebuild** — MANDATORY and easy to forget: the installed Stop hook points at `dist/bin/*.js` by absolute path, so an unbuilt change is silently ignored with zero signal
3. **Arm the target** — launch the Extension Dev Host (preLaunchTask `Install Drift Into Target Repo` runs with `presentation: 'silent'`; if the build failed the task fails invisibly and the hook is never installed) OR rely on `ensure_drift_installed` firing on Generate Diagram (its errors are swallowed by `try/catch` into `console.error`). There is no "drift armed" indicator anywhere.
4. **Trigger a sync** — start a Claude Code session in `~/workspace/bergamot`, edit a flow-relevant file, end the turn so the Stop hook fires, stages the pending set, blocks, and the `drift-reconciler` sub-agent runs `drift_sync.js` → `drift_reconcile` (own latency + token cost); OR hand-invoke the bin, reconstructing `--files`/`--store`/`--repo-root` from memory
5. **Find out what happened** — the rich stderr diagnostics (hydrate/resync/retire lines, deferral reasons, cap notices) live in the Claude session transcript, not VS Code; the only durable artifacts are `graph.db` plus loose `stitch.json`/`descriptions.json`/`drift_pending_reconcile.json`/22 stale watermark files in `.code-charter/`, none documented
6. **Inspect** — open `sqlite3` against `graph.db` and hand-write `json_extract` queries against a reverse-engineered schema (nodes/edges/edge_provenance/anchor_resolution/file_hashes)
7. **See it visually** — switch to the extension window and manually re-run "Code Charter: Generate Diagram", because nothing watches `graph.db` and the panel caches the call graph for its lifetime

**Total: ~7 steps across 3 process contexts (build tooling, a Claude session, a SQLite CLI), with silent failure at steps 2, 3, 4 and no diff view at any point.**

## Friction Points (Ranked)

### 1. No first-party way to inspect sync results

Reconcile stderr goes to the Claude session transcript; the extension has no OutputChannel (only 3 `console.*` sites visible in devtools nobody opens); no dump/inspect/query script exists anywhere in the repo. The developer must reverse-engineer the SQLite schema and hand-write `json_extract` queries to answer "did my change do what I expected?".

**Impact:** The core iteration question — is the sync working, and is it good? — is unanswerable without bespoke manual spelunking. Verified consequence: the live bergamot store's 0-bridge/1-member-edge anomaly sat unnoticed.

**Solution:** Ship a `drift-inspect` bin in `packages/drift`: summary mode (live/retired flow counts, per-flow members+seeds, description source breakdown, bridges with rationale, deferred retirements), `--json`, `--flow <id>` drill-down, and `--lint` (flows with 0 members, `stitch.json` present but 0 bridges persisted, high placeholder:llm ratio). Wire the same summary into a `Code Charter` OutputChannel on every Generate Diagram.

---

### 2. Canonical developer docs are entirely stale and drift-free

`docs/DEBUGGING.md` and `docs/DEVELOPMENT.md` reference launch configs, files, and scripts that do not exist, describe a three-package layout when there are five, and never mention drift, `graph.db`, the Stop hook, the target-repo model, or the reconcile loop — the entire mechanism under active development.

**Impact:** A developer (including the author returning after a break) following the docs is led entirely astray; the actual loop, including `stitch_eval`, is undiscoverable. A stale canonical doc is worse than none.

**Solution:** Rewrite both docs against reality: five packages, target-repo model (Dev Host → `~/workspace/bergamot`), the install/reconcile chain, where `graph.db` lives, the full change→rebuild→trigger→inspect loop, the actual launch configs, `stitch_eval` as the quality loop, and the meaning of each `.code-charter/` artifact.

---

### 3. The edit→observe loop spans 3 process contexts with no single-command deterministic path

Iterating on reconcile logic requires rebuild + a full Claude session in the target repo (or hand-reconstructed bin args) + manual `sqlite3`, even for purely deterministic changes that need no agent at all. There is no "apply my change to a fixed input and show me the output diff" command. `dry_run_store` + `--dry-run` already exist as the perfect preview primitive but are unreachable except by manual bin invocation and documented nowhere.

**Impact:** Minutes-long, error-prone iteration for what should be a seconds-long deterministic loop; agent latency and token cost paid even for non-judgement changes; the hidden `--dry-run` capability goes unused.

**Solution:** Add `npm run drift:dev -- --repo <path> --files <changed>`: runs the deterministic reconcile against a scratch copy of the store and prints a before/after diff of flows/descriptions/bridges (no Claude session). Expose `--dry-run` as a documented `drift:dryrun` wrapper and a dev-mode "Preview Drift Reconcile" command printing would-be outcomes to the OutputChannel.

---

### 4. Every intermediate failure is silent

The preLaunchTask install is `presentation: 'silent'` (a build failure means the hook is never installed, invisibly); `ensure_drift_installed` swallows errors into `console.error`; `drift_stop_hook` exits 0 on any error by design; a stale `dist` means the hook runs old code with no version mismatch signal; failure clues are scattered across the Claude transcript, devtools console, `graph.db`, and loose JSON files.

**Impact:** "Why did my sync do nothing?" is the most common debug question and currently has no starting point; the developer can iterate for a whole session against a disarmed or stale hook.

**Solution:** On activation/generate, verify the Stop hook in the target's `.claude/settings.json` and show a status-bar item ("drift armed" / "drift NOT installed — click to fix"); change the preLaunchTask to `reveal-on-problem`; persist last-attempt/last-success/last-error sync status beside the store and surface it in the OutputChannel; GC the 22 stale watermark files accumulated in bergamot.

---

### 5. No webview refresh after a sync

Nothing watches `graph.db` and the panel caches its call graph, so seeing a sync's visual effect requires manually re-running Generate Diagram. Makes it easy to misattribute a stale panel to a broken reconcile. (Same fix as Goal 1 improvement #2 — shared root cause, shared solution.)

---

### 6. Quality evaluation covers only stitch structure, at the cheapest model, and is undiscoverable

`stitch_eval.ts` is the best tooling in the system but: it scores only structural collapse — description checks assert `source==='llm'` and non-empty text, so "Handles create." for `handle_create` passes; fixtures are minimal single-hop with `expected_flow_count===1` (no partitioning, depth, fan-out, decoy, or seeds-only false-positive controls); production runs `model:inherit` while the eval defaults to haiku, so a green eval does not bound production quality; and no doc mentions the harness exists.

**Impact:** The only quality signal for the mechanism's actual value proposition (correct stitching + informative descriptions) has large blind spots; a prompt regression in `SKILL.md`/`drift-reconciler.md` ships undetected by CI.

**Solution:** Add a description-quality scoring pass (heuristic name-restatement rejection or `expected_description_contains` goldens); add multi-umbrella/deep-chain/fan-out/seeds-only-false-positive fixtures; adopt a two-model convention (haiku regression gate + periodic production-representative certification); add a CI guard on the prompt-asset hashes `stitch_eval` already computes; document the harness prominently.

---

### 7. CODE_CHARTER_DEV_MODE does nothing for the drift loop

Dev mode toggles only webview command URIs, the find widget, and the UI-bundle watcher — no store instrumentation, verbose logging, DB watching, or inspection affordance for the mechanism actually under development.

**Solution:** Extend dev mode: reveal the OutputChannel, watch `graph.db` and auto-refresh, print a store summary on each generate, expose "Dump Drift Store" and "Preview Drift Reconcile" commands.

## Missing Tooling

1. **`drift-inspect` bin**: human-readable store summary, `--json`, `--flow` drill-down, `--lint` anomaly detection (0-member flows, unpersisted stitch payloads, placeholder ratio)
2. **Persisted reconcile run log** (JSONL sidecar or disposable table): timestamp, file set, per-flow action+reason, deferrals — the data source for all other tooling
3. **`Code Charter` OutputChannel** + status-bar drift-armed indicator in the extension
4. **`drift:dev` single-command deterministic diff loop** (scratch store, before/after diff, no Claude session)
5. **`graph.db` FileSystemWatcher → webview auto-refresh**
6. **Description-quality eval** and reconcile-correctness eval generalizing the `stitch_eval` fixture pattern; a `--no-agent` fast mode scoring deterministic output without token spend
7. **Documentation of `.code-charter/` artifacts** (`graph.db`, `drift_pending_reconcile.json`, `stitch.json`, `descriptions.json`, watermark files) so loose files are diagnosable
8. **Watermark-file GC** (one cursor file or drop cursors older than N days)

## Quick Wins (One Session Each)

- Two PRAGMA lines (`journal_mode=WAL`, `busy_timeout=5000`) in `sqlite_graph_store.ts` — eliminates the entire `SQLITE_BUSY` class
- Change the "Install Drift Into Target Repo" task `presentation` from `silent` to `reveal-on-problem` in `.vscode/tasks.json`
- Create the `Code Charter` OutputChannel and route the 3 existing `console.*` sites plus install results through it
- `npm run drift:dryrun` wrapper exposing the already-built `--dry-run` path, plus a README paragraph on it and on `stitch_eval`
- Anti-divergence test: write pending file via `serialize_pending_reconcile` (TS), consume via `drift_sync.js` — pins the duplicated contract
- CI hash-guard on `SKILL.md`/`drift-reconciler.md` (hashes already computed by `stitch_eval`) flagging prompt changes as needing a manual Tier-2 run
- Delete or stub the stale `DEBUGGING.md`/`DEVELOPMENT.md` content immediately — stop actively misleading
- Log a diagnostic when a `delta.modified` symbol_path fails the `anchored_symbols` join in `reconcile.ts` — one stderr line, closes a silent-staleness hole

## The Hidden Assets Already Built

Much of the feedback-loop fix is surfacing what already exists rather than building new machinery:

- `dry_run_store`/`--dry-run` — exists and works, unreachable and undocumented
- `stitch_eval.ts` — the best tooling in the system, undiscoverable from the docs
- Rich `ReconcileResult` diagnostics — produced correctly, then discarded to ephemeral stderr
- `on_call_graph_changed` on `AriadneProjectManager` — the subscription hook exists, never wired
