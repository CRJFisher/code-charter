---
contract: harvested_fixture_manifest
contract_version: 1
file: src/reconcile/__fixtures__/stitch_eval_harvested/<slug>/fixture.json
owner: drift-harvest (src/bin/drift_harvest.ts) — producer
consumers: stitch_eval (src/bin/stitch_eval.ts) — loads manifests into its run set
pinned_by: src/bin/drift_harvest.test.ts, src/bin/stitch_eval_manifest.test.ts
---

# Harvested fixture manifest (`fixture.json`)

One JSON object per harvested golden case: a graded real reconcile run frozen into a
stitch_eval fixture. It sits IN the fixture directory beside the copied source files
(the minimal repo slice). stitch_eval discovers every
`stitch_eval_harvested/*/fixture.json`, builds a `FixtureExpectation` from `detail`, and
runs it alongside the hand-authored adversarial array — harvesting is a pure additive
file drop, never an edit to stitch_eval. Per decision-10, generic provenance lives at
the top level and the stitch_eval-specific expectation lives under `detail`.

## Top-level keys (mechanism-agnostic provenance)

| key            | type                       | semantics                                              |
| -------------- | -------------------------- | ------------------------------------------------------ |
| schema_version | integer (= 1)              | required; stitch_eval skips a foreign version          |
| run_id         | string                     | the graded run this fixture was harvested from         |
| verdict        | "good" \| "bad" \| "mixed" | the human grade at harvest time (v1 harvests only good)|
| reason         | string                     | the grader's one-line why — traceability when it fails |
| graded_at      | ISO-8601 string            | copied from the grade record                           |
| source_repo    | string                     | provenance of origin, e.g. "bergamot"                  |
| harvested_at   | ISO-8601 string            | when the fixture was frozen                            |
| detail         | object                     | the stitch_eval expectation (below)                    |

## `detail` keys (the derived expected outcome)

| key                          | type                                         | semantics                                       |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------ |
| kind                         | "stitch" \| "stitch_seeds_only" \| "decline" | derived from the graded run's store state        |
| files                        | string[] (repo-relative)                     | the changed set — staged as the pending trigger  |
| expected_flow_count          | integer                                      | live flows the run produced over that set        |
| expected_members             | string[]                                     | the flows' induced membership (anchor_set union) |
| expected_description_anchors | string[]                                     | members whose description source is "llm"        |

## Derivation (harvest time, from run record + store snapshot)

- `kind`: a persisted bridge touching the run's flows → "stitch"; a multi-seed flow with
  no bridge → "stitch_seeds_only"; only singletons → "decline".
- The expected fields are read from the store the graded run produced, NOT from the run
  record's `outcomes` verbatim — the consumer (stitch_eval's scorer) speaks
  `FixtureExpectation`, so the manifest speaks it too.

## Harvest-only-good rule

Only `good`-graded runs are harvested: the expectation asserts "the agent reproduces the
human-blessed judgement on real code", which is only a valid positive golden for a good
run. The harvester refuses ungraded, bad, and mixed runs; the `verdict` field records
direction so a future negative-fixture mode can relax this without a schema change.

## Replay semantics and the incremental residual

stitch_eval replays a harvested fixture exactly like a hand-authored one: scaffold a
throwaway repo from the snapshot, stage `detail.files` as the pending set, drive the
live agent from an EMPTY store, score against `detail`. Runs whose graded outcome
depended on prior store state (retirements, resyncs) are therefore not faithfully
reproducible and should not be harvested; provenance keeps the door open for a
store-slice harvester later.

## Changelog

- v1: initial manifest — generic provenance top-level + derived FixtureExpectation
  under `detail`; consumed by stitch_eval via directory discovery. The loader wraps the
  flat `expected_members` list into stitch_eval's umbrella-list expectation shape
  (harvested runs are single-umbrella by construction); harvested fixtures pin no
  pre-stitch floor, so `--no-agent` skips them.
