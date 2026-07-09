---
id: TASK-27.1.20.16
title: >-
  Trajectory view in drift-inspect: join a run to its transcript and print the
  salient spine
status: To Do
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

- [ ] #1 drift-inspect --trajectory <run-id|latest> prints the spine for one run: the verbatim hook instruction, the reconciler sub-agent's chronological context-gathering steps (tool name + target only), stitch/describe decisions with their inference_rationale, and the per-flow outcomes + describe tally from the run record
- [ ] #2 Degrades gracefully when the transcript is missing or rotated: falls back to an effect-only view from the run record with an explicit "transcript unavailable" marker, never errors
- [ ] #3 --json emits the spine in the neutral four-kind step schema (instruction | context | judgement | effect), specified in a pinned contract doc per decision-10, with drift-specific payloads under each step's detail key; the grading queue in .17 consumes only the neutral fields
- [ ] #4 Spine extraction (drift- and transcript-aware) and spine rendering (neutral-schema-only) are separate modules with the boundary named; the renderer never imports drift engine internals

<!-- AC:END -->
