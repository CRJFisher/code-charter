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
| schema_version  | integer (= 1)     | required; a reader SKIPS any line whose value is not its own version |
| run_id          | string            | required; unique per bin invocation, lexicographically time-sortable |
| session_id      | string \| null    | null for hand-invoked / no-session runs                              |
| transcript_path | string (optional) | OMITTED when session_id is null; else the derived transcript path    |
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

## `transcript_path` is derived, not copied

`transcript_path = <claude-config>/projects/<slug(cwd)>/<session_id>.jsonl`, where
`<claude-config>` is `$CLAUDE_CONFIG_DIR` when set, else `~/.claude`, and `slug(cwd)`
replaces every character outside `[A-Za-z0-9]` with `-`. It is a pure function of the
join key (`session_id`, session `cwd`) — recomputable by any downstream tool from the
record alone, which is why it is derived rather than copied from the hook payload's
live path. The stored value is a denormalized convenience; the authoritative join key
is `session_id` + the session `cwd`. When the path does not resolve to a file (rotated
transcript, nonstandard host layout), readers fall back to an effect-only view;
`session_id` remains authoritative. The Stop hook compares its derivation against the
payload's live `transcript_path` on every fire and emits a stderr note on mismatch, so
slug drift surfaces in the field.

## Versioning

Records from a foreign `schema_version` (including pre-contract flat records, which
carry none) are skipped by readers, never migrated. The log is disposable, so a
mixed-version log after an upgrade is expected and harmless.

## Changelog

- v1: initial split-shape record — top-level join key (`run_id`, `session_id`,
  `transcript_path`, `instruction`, `timestamp`) + nested drift `detail`.
