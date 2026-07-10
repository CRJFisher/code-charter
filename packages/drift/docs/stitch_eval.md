# The stitch eval harness

The harness measures the one thing CI cannot see directly: the drift-reconciler agent's
stitch/describe judgement, which is authored as prose in two prompt assets —
`assets/skills/drift-sync/SKILL.md` and `assets/agents/drift-reconciler.md`. Every run
scaffolds a throwaway repo per fixture, stages the pending set the way the Stop hook
would, drives a reconcile, and scores the resulting store against the fixture's
expectation.

## Two tiers, three run modes

| tier / mode | command | spends tokens | what a green run means |
| --- | --- | --- | --- |
| Tier 1 (CI) | `npm test` (`reconcile_stitch_eval.test.ts`) | no | the deterministic contract holds: fixtures fragment as designed, golden stitch payloads replay, the evidence bar rejects uncorroborated bridges |
| `--no-agent` fast mode | `npm run stitch_eval:fast [fixture]` | no | harness plumbing + installer bundle + every fixture's resolution gap are healthy (the pre-stitch floor: fragmented singletons, zero bridges, zero llm descriptions) — says NOTHING about judgement |
| haiku regression gate | `STITCH_EVAL_LIVE=1 npm run stitch_eval [fixture]` | yes (haiku) | the live agent's judgement passes every fixture at the routine model |
| certification | `STITCH_EVAL_LIVE=1 STITCH_EVAL_MODEL=<prod-model> npm run stitch_eval` | yes | production-representative judgement, before merging a prompt change |

Haiku is the iteration model for every routine live run. A certification pass on the
production session model is a deliberate, human-initiated gate before merging a
stitching-prompt change — it is never automated, never a default, and never runs in CI.
The report header records the model per run and stamps `CERTIFICATION RUN` on any
non-haiku model, so archived reports in `.stitch_eval_runs/` are self-identifying.

## Fixture taxonomy

Hand-authored fixtures live in `src/reconcile/__fixtures__/stitch_eval/<name>/`, one
Ariadne resolution weakness each, with expectations in `stitch_eval.ts`'s
`EXPECTATIONS`:

- **Single-umbrella weaknesses** — `dynamic_key_dispatch`, `untyped_callback_invocation`,
  `untyped_receiver_method`, `interface_method`, `barrel_reexport`.
- **Adversarial classes** — `multi_umbrella` (two independent clusters: the agent must
  PARTITION, not lump), `deep_chain` (a four-hop dynamic chain: evidence lives several
  reads from the seed), `fan_out` (one hub, four handlers: breadth), and
  `seeds_only_decoy` (maximal surface similarity, zero connection: name similarity is
  ranking, never evidence).
- **Controls** — `control_unrelated_pair` and `seeds_only_decoy` expect a decline.
- **Harvested goldens** — graded real runs frozen by `drift-harvest` into
  `stitch_eval_harvested/<slug>/fixture.json`, discovered automatically
  (docs/contracts/harvested_fixture_manifest.md).

Umbrella scoring is an exact partition: every expected member-set must equal exactly one
observed multi-seed flow's `anchor_set`, no observed umbrella may go unmatched, and no
flow can satisfy two expectations — a fragmented, merged, or surplus result fails even
when the flow count coincides.

## Description quality

Two layers score each `expected_description_anchors` entry beyond `source === "llm"`:

1. **Name-restatement floor** (`src/reconcile/description_quality.ts`): a description
   whose every content word is derived from the member's own name (exact, inflected, or
   ≥4-char shared prefix; stopwords ignored) is rejected — "Handles create." for
   `handle_create` teaches a diagram reader nothing. The rule fires only on this
   zero-content degenerate case; semantic padding is deliberately out of its reach.
2. **Per-fixture goldens** (`expected_description_contains`): case-insensitive
   substrings the description must carry — the precision layer for domain terms a
   name-echo would lack (e.g. `dispatch` must mention the registry).

## The prompt-asset pin (CI guard)

`assets/prompt_asset_pins.json` pins the 12-hex sha256 of both prompt assets;
`src/reconcile/prompt_assets.test.ts` recomputes them on every `npm test` (and so in
CI). Any prompt edit fails CI with a message naming the drifted file, both hashes, and
the re-certification loop:

```
cd packages/drift && npm run build && STITCH_EVAL_LIVE=1 npm run stitch_eval
npm run stitch_eval:pin   # rewrites assets/prompt_asset_pins.json — commit it with the prompt change
```

The friction is the point: a prompt change ships only alongside a pin bump, and the pin
bump is the on-record acknowledgement that a Tier-2 run was due. The report header, the
pin file, and the guard all share one hashing rule (`src/reconcile/prompt_assets.ts`).

## Deferred scope

- **Harvest-primary fixtures**: the golden corpus grows from organically captured,
  human-graded real runs via `drift-inspect --grade` + `drift-harvest`
  (task-27.1.20.17); hand-authored fixtures are reserved for the adversarial gaps real
  work has not hit.
- **LLM description-quality judge**: none ships until its verdicts are calibrated
  against the human grades corpus via `drift-calibrate`
  (docs/contracts/judge_calibration.md) — the standing gate for task-27.1.20.13's AC#7.
