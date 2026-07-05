# Drift Sync Deep Review

## Purpose

This is the parent document for a two-part deep review of the drift syncing mechanism. The review covers:

1. **Implementation Review** — completeness, correctness, and efficacy of the sync pipeline
2. **Feedback Loop Review** — developer experience when debugging drift sync, including tooling gaps

The review was produced by a 49-agent multi-model workflow (Sonnet file reads → Opus domain analysis × 5 → Fable synthesis).

## What Drift Sync Is

Drift sync is the mechanism that keeps code flow graphs ("stitches") up to date as the codebase changes. When a developer edits code, Claude Code fires a Stop hook, which stages the changed files, launches a `drift-reconciler` sub-agent, which runs the `drift-reconcile` bin against the SQLite graph store. The result is an updated set of flows (agentic.flow nodes with member descriptions and inter-flow bridges) that the VS Code extension displays as diagram panels.

The pipeline is: **Stop hook → transcript watermark → pending-reconcile handoff → drift_sync.js → drift-reconcile bin → deterministic reconcile engine → optional agent stitching + describing → graph.db**

## Overall Assessment

The deterministic engine is architecturally sound and unusually well-tested. The agentic layer is under-fed and under-measured. Three structural gaps dominate both goals:

1. **Concurrency vacuum** — three uncoordinated actors (Stop hook subprocess, reconcile bin, VS Code extension) share `graph.db` and the pending handoff file with no WAL, no busy_timeout, no lockfile, and non-atomic writes. Every high-severity data-integrity finding traces here.

2. **Missing final pipeline stage** — nothing watches `graph.db`, so reconcile results never reach an open webview without manual intervention.

3. **Silence by design** — the hook exits 0 on any error, installs swallow exceptions, stderr lands in a Claude session that is a different process from VS Code. Correct production posture, but with no durable record anywhere, correctness bugs and developer friction are indistinguishable from healthy no-ops.

## Recommended Next Session

Build the **observability-and-safety spine** — small, self-contained, unblocks all subsequent work on both goals:

1. `PRAGMA journal_mode=WAL` + `busy_timeout=5000` in `sqlite_graph_store.ts`, open extension connection read-only (~30 lines)
2. Persist a reconcile run log (JSONL beside `graph.db`: timestamp, file set, per-flow action + reason, deferrals, placeholder counts)
3. Ship a `drift-inspect` bin reading store + run log — run immediately against `~/workspace/bergamot/.code-charter/graph.db` to diagnose the verified 0-bridge-edges anomaly
4. Add `Code Charter` OutputChannel + debounced `graph.db` FileSystemWatcher in `extension.ts` so syncs surface in-editor and the webview refreshes

## Child Documents

- [Goal 1: Implementation Review](drift-sync-review-implementation.md)
- [Goal 2: Feedback Loop Review](drift-sync-review-feedback-loop.md)
