---
contract: trajectory_spine
contract_version: 1
file: stdout of `drift-inspect --trajectory <run-id|latest> --json` (a bin projection, not a sidecar)
owner: drift-inspect --trajectory (src/inspect/trajectory_extract.ts) — sole producer today
consumers: drift-inspect text renderer (src/inspect/trajectory_render.ts) + the .17 grading queue
pinned_by: src/inspect/trajectory_extract.test.ts, src/inspect/trajectory_render.test.ts, src/bin/drift_inspect.test.ts
---

# Trajectory spine (`drift-inspect --trajectory --json`)

The neutral projection of one reconcile run: what the reconciler was asked
(instruction), what it looked at (context), what it decided (judgement), and what
changed (effect). Per decision-10, mechanism-agnostic keys live at the top level and
every drift-specific field lives under a `detail` object — on the envelope AND on every
step. A consumer that knows only this doc (the .17 grading queue) renders any spine
from the neutral fields alone; `detail` is opaque to it.

## Envelope (mechanism-agnostic)

| key                  | type            | semantics                                                                  |
| -------------------- | --------------- | --------------------------------------------------------------------------- |
| schema_version       | integer (= 1)   | required; a consumer of a foreign version renders nothing, never migrates   |
| run_id               | string          | the run this spine projects (the run-record join key)                       |
| session_id           | string \| null  | null for hand-invoked runs                                                  |
| timestamp            | ISO-8601 string | run-completion time, copied from the run record                             |
| transcript_available | boolean         | false whenever context steps could not be reconstructed (any tier below)    |
| availability_note    | string          | "" when available; else a one-line marker the renderer prints verbatim      |
| steps                | SpineStep[]     | the spine, in canonical order (below)                                       |
| detail               | object          | drift envelope payload: { mode, availability_tier?, notes: string[] }       |

## SpineStep (mechanism-agnostic)

| key     | type                                                   | semantics                                                            |
| ------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| kind    | "instruction" \| "context" \| "judgement" \| "effect" | the neutral step kind — the only branch key a neutral consumer uses   |
| ordinal | integer                                                | 0-based, gap-free index over `steps` in canonical order               |
| at      | ISO-8601 string \| null                                | wall-clock time when known (context steps only); null otherwise       |
| summary | string                                                 | the fully-composed human-renderable line — the load-bearing neutral field |
| detail  | object                                                 | the drift payload for this step; neutral consumers never read it       |

## Canonical order and ordering guarantee

`steps` is emitted as: the single `instruction` step (when the run had one) →
`context` steps in transcript-chronological order → `judgement` steps (stitch umbrellas
in sidecar order, then persisted bridges) → `effect` steps (flow outcomes in run-record
order, then one describe-tally step). `ordinal` is contiguous over that sequence.
Consumers iterate by `ordinal`; `at` is advisory, populated only on context steps, and
NOT monotonic across kinds — never sort by it.

## Per-kind `detail` (drift-owned; opaque to neutral consumers)

- instruction: `{}`
- context: `{ tool, target }`
- judgement: `{ judgement_kind: "stitch", label, seed_count, rationale }` or
  `{ judgement_kind: "bridge", src_id, dst_id, rationale }`
- effect: `{ effect_kind: "flow_outcome", flow_id, action, kind, member_count, last_synced_at, reason }`
  or `{ effect_kind: "describe_tally", counts }`

JSON key order mirrors these tables but is not wire-normative — consumers address fields
by name.

## Availability tiers (`transcript_available === false`)

A first-class schema state, never an error. `detail.availability_tier` names the tier;
the spine still carries the record-derived instruction, judgement, and effect steps —
the effect-only fallback floor:

| tier                  | cause                                                              |
| --------------------- | ------------------------------------------------------------------ |
| no_session            | the run record has session_id null (hand-invoked)                  |
| path_not_recorded     | transcript_path omitted from the record (session cwd was unknown)  |
| file_missing          | the recorded transcript path does not resolve on disk (rotated)    |
| no_reconciler_span    | transcript present but no drift-reconciler launch matched in it    |
| subagent_file_missing | launch found but its subagents/agent-<id>.jsonl is absent          |

## Judgement provenance caveats

`stitch.json` is a latest-run sidecar, overwritten per run: umbrella judgement steps
are emitted only when the projected run IS the newest record; otherwise they are
omitted and `detail.notes` says so. Bridge judgement steps read the CURRENT store —
durable, but store-state rather than run-scoped (the same dev-loop imprecision the
pending-handoff contract accepts). Effect steps come from the run record and are always
run-scoped.

## What .17 may rely on

Only: `schema_version`, `run_id`, `session_id`, `timestamp`, `transcript_available`,
`availability_note`, and each step's `kind` / `ordinal` / `summary`. Grouping by `kind`
and printing `summary` in `ordinal` order is a complete render. No `detail` key is
stable for .17.

## Changelog

- v1: initial four-kind neutral spine (instruction | context | judgement | effect):
  envelope + step generic/`detail` split, availability tiers as first-class state.
