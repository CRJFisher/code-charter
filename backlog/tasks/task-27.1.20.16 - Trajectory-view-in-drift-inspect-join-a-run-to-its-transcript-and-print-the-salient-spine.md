---
id: TASK-27.1.20.16
title: >-
  Trajectory view in drift-inspect: join a run to its transcript and print the
  salient spine
status: Done
assignee: []
created_date: "2026-07-09"
labels:
  - drift
  - observability
  - dx
dependencies:
  - TASK-27.1.20.15
parent_task_id: TASK-27.1.20
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The core visibility gap in the drift dev loop: answering "was the reconciler's judgement good?" requires seeing what it was asked, what it looked at, what it decided, and what changed — today those live respectively nowhere, in a dead session transcript, in stitch.json rationales, and in the run record, with no tool joining them. With the join key persisted (.15), add the read-side view: `drift-inspect --trajectory <run-id|latest>` prints the salient spine of one reconcile run — instruction → context-gathering → judgement (with rationales) → effect. Salient means the spine only: tool names and targets, not payloads; decisions and reasons, not raw transcript.

Placement decision (frozen): this is drift-shaped read-side tooling and lives in packages/drift beside stitch_eval and drift-inspect — a mechanism's feedback loop is part of the mechanism. Borrow, don't build, at one seam only: sr-discover's JSONL transcript-parsing / sub-agent-span helpers (~/.claude/skills/sr-discover/, called by absolute path) may be reused where they fit; extending sr-discover itself is optional and not blocking, since the transcript path is derived, not discovered.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 drift-inspect --trajectory <run-id|latest> prints the spine for one run: the verbatim hook instruction, the reconciler sub-agent's chronological context-gathering steps (tool name + target only), stitch/describe decisions with their inference_rationale, and the per-flow outcomes + describe tally from the run record
- [x] #2 Degrades gracefully when the transcript is missing or rotated: falls back to an effect-only view from the run record with an explicit "transcript unavailable" marker, never errors
- [x] #3 --json emits the spine in the neutral four-kind step schema (instruction | context | judgement | effect), specified in a pinned contract doc per decision-10, with drift-specific payloads under each step's detail key; the grading queue in .17 consumes only the neutral fields
- [x] #4 Spine extraction (drift- and transcript-aware) and spine rendering (neutral-schema-only) are separate modules with the boundary named; the renderer never imports drift engine internals

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

`drift-inspect --trajectory <run-id|latest>` projects one reconcile run as the neutral four-kind spine — instruction → context → judgement → effect — pinned by `docs/contracts/trajectory_spine.md`. The verbatim hook instruction and the per-flow outcomes + describe tally come from the run record (the durable floor); context steps come from the reconciler sub-agent's own transcript, joined via the record's stored `transcript_path`, the `Task`/`Agent` launch whose `[launch, result]` window contains the run's completion time (with latest-before and last-in-file fallbacks), and the result line's `toolUseResult.agentId` with a `meta.json` `toolUseId` fallback; judgement steps carry stitch-umbrella rationales (newest run only — the sidecar is per-run overwritten, and older runs get an explicit staleness note) plus persisted bridge `inference_rationale` from the store. Context steps are tool name + one addressing field only, truncated — payloads never enter the spine.

The extraction/rendering boundary is named at `src/inspect/trajectory_schema.ts`: a zero-import neutral types module. `trajectory_extract.ts` (drift- and transcript-aware, IO injected so units test over strings) produces the spine; `trajectory_render.ts` consumes only the schema module — pinned by an import-boundary test that also rules out `require()`/dynamic `import()`. `--json` emits the spine verbatim; the envelope and per-step key partitions are asserted against the real bin output, and the .17 grading queue's consumable surface (`kind`/`ordinal`/`summary` + envelope neutrals) is enumerated in the contract doc.

Degradation is a first-class schema state, never an error: five availability tiers (`no_session`, `path_not_recorded`, `file_missing`, `no_reconciler_span`, `subagent_file_missing`) each fall back to the effect-only view with an explicit "transcript unavailable" marker and exit 0 — every tier unit-tested, and the `file_missing`/`no_session` tiers additionally driven end-to-end against the real store the .15 verification left behind. The run-log reader grew `read_reconcile_record_by_run_id` beside `read_latest_reconcile_record`, both over one shared newest-first scan with the same version + `detail` guard, and thin `detail` records degrade instead of throwing (parity with `summary.ts`).

Review (7 lenses) confirmed all four ACs and drove: coverage for the untested `path_not_recorded` tier, span-ladder tier 3, and the two-containing-windows tie-break; a bin fixture that exercises stitch judgement end-to-end for latest-vs-older runs; the envelope key pin; wire key order matched to the contract tables; and corrected bin-header/`transcript_path` comments. Noted, not actioned: `availability_tier` stays drift-owned until .17 proves a neutral need; a multi-tool_result line could misbind `agentId` (bounded by the meta fallback); a corrupt store still throws on the bridges read (parity with every existing view).
<!-- SECTION:NOTES:END -->
