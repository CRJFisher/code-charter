---
contract: reconcile_run_record
contract_version: 1
file: drift_reconcile_log.jsonl
owner: drift-inspect (src/inspect/read_input.ts) — single consumer today
producer: src/bin/drift_reconcile.ts (finish_run)
pinned_by: src/reconcile/reconcile_log.test.ts, src/bin/drift_reconcile.test.ts
---

# Reconcile run record (`drift_reconcile_log.jsonl`)

Append-only JSONL beside the store; one line per COMPLETED reconcile run. Disposable —
delete it with the db. Per decision-10, mechanism-agnostic keys live at the top level and
every drift-specific field lives under `detail`.

## Top-level keys (mechanism-agnostic)

| key             | type              | semantics                                                            |
| --------------- | ----------------- | -------------------------------------------------------------------- |
| schema_version  | integer (= 1)     | required; a reader SKIPS any line whose value is not its own version, or that lacks a `detail` object |
| run_id          | string            | required; unique per bin invocation, lexicographically time-sortable |
| session_id      | string \| null    | null for hand-invoked / no-session runs                              |
| transcript_path | string (optional) | present only when BOTH session_id and the session cwd were known at write time (drift_sync.js forwards them all-or-nothing off the handoff); OMITTED otherwise |
| instruction     | string \| null    | verbatim Stop-hook instruction; null for hand-invoked runs           |
| timestamp       | ISO-8601 string   | run-completion time                                                  |
| detail          | object            | the drift payload (below)                                            |

## `detail` keys (drift-specific)

| key                  | type                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| mode                 | "default" \| "list_entrypoints" \| "apply_stitch" \| "apply_descriptions" |
| file_set             | string[] (repo-relative)                                                   |
| outcomes             | FlowOutcome[]                                                              |
| deferred_retirements | DeferredRetirement[]                                                       |
| deferred_skill_syncs | DeferredSkillSync[]                                                        |
| description_counts   | { docstring, provisional, placeholder, llm }                               |
| diagnostics          | string[]                                                                   |

## `run_id` format

`<compact-iso>-<8 hex>`, e.g. `20260710T140355123Z-a1b2c3d4`. The fixed-width compact
ISO prefix makes lexicographic order chronological (newest-first grading and
`--trajectory latest` resolution need no timestamp parse); the random suffix carries
uniqueness.

## `transcript_path` derivation

`transcript_path = <claude-config>/projects/<slug(cwd)>/<session_id>.jsonl`, where
`<claude-config>` is `$CLAUDE_CONFIG_DIR` when set, else `~/.claude`, `slug(cwd)`
replaces every character outside `[A-Za-z0-9]` with `-`, and `cwd` is the launching
session's working directory as staged in the pending-reconcile handoff. The bin
computes the path ONCE at write time and stores the result; the raw `cwd` is not
persisted (the slug is lossy, so it cannot be recovered from the stored path). Within
the record, `session_id` is the authoritative session identifier and `transcript_path`
is a stored snapshot of the derivation. When the path does not resolve to a file
(rotated transcript, nonstandard host layout), readers degrade to an effect-only view;
`session_id` remains authoritative. The Stop hook compares this same derivation against
the payload's live `transcript_path` on every fire and emits a stderr note on mismatch,
so a host-side change to the slug rule surfaces in the field.

## Versioning

Records from a foreign `schema_version` (including pre-contract flat records, which
carry none) are skipped by readers, never migrated. The log is disposable, so a
mixed-version log after an upgrade is expected and harmless.

## Changelog

- v1: initial split-shape record — top-level join key (`run_id`, `session_id`,
  `transcript_path`, `instruction`, `timestamp`) + nested drift `detail`.
