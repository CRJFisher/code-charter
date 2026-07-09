---
id: TASK-27.1.20.4
title: >-
  Ship a drift-inspect bin: store summary, --json, --flow drill-down, --lint
  anomaly detection
status: Done
assignee: []
created_date: "2026-07-05 13:50"
labels:
  - drift
  - tooling
  - dx
dependencies:
  - TASK-27.1.20.1
  - TASK-27.1.20.3
parent_task_id: TASK-27.1.20
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[No first-party way to inspect sync results] Reconcile stderr goes to the Claude session transcript; the extension has no OutputChannel; no dump/inspect/query script exists anywhere in the repo. The developer must reverse-engineer the SQLite schema and hand-write json_extract queries to answer "did my change do what I expected?". Verified consequence: the live bergamot store contains a probable anomaly (34 flows and a stitch.json beside the DB but ZERO agentic.bridge edges and only 1 flow_member edge, plus 24 placeholder descriptions) that no tool exists to notice.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 drift-inspect summary mode: live/retired flow counts, per-flow members+seeds, description source breakdown (placeholder vs llm), bridges with rationale, deferred retirements
- [x] #2 --json output and --flow <id> drill-down
- [x] #3 --lint anomaly detection: flows with 0 members, stitch.json present but 0 bridges persisted, high placeholder:llm ratio
- [x] #4 Run against ~/workspace/bergamot/.code-charter/graph.db and report whether the 0-bridge-edge anomaly is a real stitch-persistence regression

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

`drift-inspect` is a read-only bin that answers "did my last sync do what I expected?" without hand-writing `json_extract` queries. It opens the graph store read-only and folds in the durable reconcile run log from .3 (`drift_reconcile_log.jsonl` + `drift_reconcile_status.json`). Three views: the default whole-store **summary** (live/retired flow counts, per-flow members and seeds, the description-source split, every persisted bridge with its rationale, the newest turn's deferred retirements, and a sync-status health line); **`--flow <id>`** drills into one flow (its seeds, each member's description, the bridges it touches); **`--lint`** raises anomalies. `--json` emits the same projection as JSON for any of them.

The work splits into three pure modules plus a thin bin so the OutputChannel (.5) and drift:dev (.7) reuse the collectors and renderers rather than re-deriving them: `inspect/summary.ts` (collectors + lint, pure over a snapshot + run-log context), `inspect/render.ts` (pure text renderers), and `bin/drift_inspect.ts` (the IO — opening the store, reading sidecars, dispatch). The public seam is exported from `@code-charter/drift`: the collectors, renderers, `InspectInput`, and the run-log readers/types a consumer needs to construct an input.

### Key decisions

- **Membership reads `anchor_set`, not `flow_member` edges.** A pure code flow induces its members and persists no member edges (only linked-doc members get edges), so an edge count reports a code flow as empty. `anchor_set` is the induced-membership snapshot and is the truth for member counts and for scoping a bridge to its flow. This is why the "1 flow_member edge across 34 flows" in the original anomaly report was a red herring, not a defect.

- **`--lint` "unpersisted bridges" compares declared vs persisted, not literal zero.** AC#3's wording ("stitch.json present but 0 bridges persisted") is implemented as *the stitch proposal declared ≥1 bridge but the store persisted none* — a real stitch-persistence regression. A seeds-only proposal (zero declared bridges) is not flagged, because zero persisted bridges is the correct outcome there. The literal reading would false-positive on every seeds-only store and would make AC#4 unanswerable.

### AC#4 verdict — the 0-bridge anomaly is NOT a regression

Run against `~/workspace/bergamot/.code-charter/graph.db`: 26 live flows, 10 retired, 0 persisted bridges, descriptions 50 llm / 23 placeholder, `--lint` clean. The store's `stitch.json` declares exactly one umbrella ("runtime message processing flow") with `bridges: []` and the rationale "No recorded unresolved site exists, so seeds-only." Zero persisted bridges is the *correct* persistence of a zero-bridge proposal, not a persistence bug — the root-cause-aware lint confirms it (no anomaly). The 23:50 placeholder:llm ratio (32%) is below the anomaly threshold, so it is not flagged either.

### AC-to-test mapping

- AC#1 → `summary.test.ts` (`collect_store_summary`: live/retired counts and ordering, `anchor_set` membership, per-flow + store-wide description breakdown, bridge scoping with rationale, deferred retirements from the newest record); `render.test.ts` (`render_summary`, sync-status line incl. `last_error`); `drift_inspect.test.ts` (`--json` over a hydrated store; retired flow surfaced end-to-end).
- AC#2 → `summary.test.ts` (`collect_flow_detail`); `render.test.ts` (`render_flow_detail`); `drift_inspect.test.ts` (`--flow`, unknown-flow exit 1).
- AC#3 → `summary.test.ts` (`detect_anomalies`: empty_flow live-only, unpersisted-bridges with the declared-and-persisted-is-clean and seeds-only carve-outs, placeholder-ratio boundary at the min count and the exact ratio); `drift_inspect.test.ts` (`--lint` clean, seeds-only clean, declared-but-unpersisted exit 1).
- AC#4 → manual execution against the bergamot store (verdict above); not unit-tested.

### Review outcome

A `snapshot()` regression surfaced in review: `store.snapshot()` filters `deleted_at IS NULL`, so retired flows never reached the bin (`retired_flow_count` was always 0, `--flow <retired_id>` always failed) — directly defeating AC#1's live/retired counts. Fixed by extending `GraphStore.snapshot(opts?: { include_deleted? })` across the interface and both implementers (and the dry-run wrapper); the bin reads with `include_deleted: true` while the bridge/description collectors keep their own live-only filters. Proven: bergamot now reports 10 retired flows where it previously reported 0.

Notes deferred as out-of-scope: a corrupt (non-SQLite) store file throws with a raw stack rather than a clean error; `--lint` does not echo the declared-vs-persisted bridge counts (the verdict is encoded in lint-clean + the summary's `bridges:` line).

### Reuse

The bin is standalone dev tooling — not wired into the installer or the drift-sync skill. The exported collectors/renderers are the seam the OutputChannel (.5) and drift:dev (.7) build on.
<!-- SECTION:NOTES:END -->
