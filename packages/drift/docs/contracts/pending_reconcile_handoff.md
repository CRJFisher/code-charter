---
contract: pending_reconcile_handoff
contract_version: 1
file: drift_pending_reconcile.json
owner: drift-sync bundled script (assets/skills/drift-sync/scripts/drift_sync.js)
producers: src/hooks/pending_reconcile.ts (staging writer) + drift_sync.js (union-back)
mirror: the byte format is duplicated in drift_sync.js (which runs standalone and cannot
  import src) and pinned by src/skill/drift_sync_contract.test.ts
---

# Pending-reconcile handoff (`drift_pending_reconcile.json`)

A single JSON object beside the store. The Stop hook stages the changed-file set plus
the session context here; `drift_sync.js` claims and consumes it, forwarding the session
context to the reconcile bin as `--session-id` / `--session-cwd` / `--instruction`.
Transient — parse failure is treated as "nothing pending", so a stale or old-shape file
is safely ignored rather than migrated.

| key     | type                      | semantics                                                |
| ------- | ------------------------- | -------------------------------------------------------- |
| version | integer (= 1)             | advisory; an absent or mismatched version is tolerated    |
| files   | string[] (repo-relative)  | UNIONED across Stop fires; first-seen order preserved     |
| session | object \| null            | session context; null when no hook session produced the set (e.g. test scaffolds) |

## `session` object

| key         | type   | semantics                                                        |
| ----------- | ------ | ----------------------------------------------------------------- |
| session_id  | string | the Stop payload's `session_id` — the transcript join key         |
| cwd         | string | the Stop payload's `cwd` (absolute; the transcript-slug source)   |
| instruction | string | the verbatim instruction the hook emitted as the Stop `reason`    |

## Union semantics (multi-turn / multi-session)

`files` accumulate across turns. `session` is NEWEST-CONTRIBUTOR-WINS: each Stop fire
overwrites it with the current turn's context, and when `drift_sync.js` unions a claimed
set back after a failed reconcile it keeps the live pending file's session when one has
been staged meanwhile, restoring the claimed session only otherwise. When turns from
different sessions union into one handoff, the eventual run is attributed to the newest
contributor — accepted imprecision: this is a dev-loop join aid, not an audit ledger.

## Changelog

- v1: added `version` + `session`; `files` unchanged from the pre-contract shape.
