---
id: TASK-27.1.20.13
title: >-
  Eval harness improvements: description quality, richer fixtures, two-model
  gate, prompt-hash CI guard
status: In Progress
assignee: []
created_date: "2026-07-05 13:52"
labels:
  - drift
  - eval
  - quality
dependencies:
  - TASK-27.1.20.12
  - TASK-27.1.20.17
parent_task_id: TASK-27.1.20
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[Quality evaluation covers only stitch structure, at the cheapest model, and is undiscoverable] stitch_eval.ts is the best tooling in the system but: it scores only structural collapse — description checks assert source===llm and non-empty text, so "Handles create." for handle_create passes; fixtures are minimal single-hop with expected_flow_count===1 (no partitioning, depth, fan-out, decoy, or seeds-only false-positive controls); production runs model:inherit while the eval defaults to haiku, so a green eval does not bound production quality; and no doc mentions the harness exists. A prompt regression in SKILL.md/drift-reconciler.md ships undetected by CI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Add a description-quality scoring pass: heuristic name-restatement rejection, or expected_description_contains goldens
- [x] #2 Add multi-umbrella / deep-chain / fan-out / seeds-only-false-positive fixtures
- [x] #3 Adopt a two-model convention: haiku regression gate + periodic production-representative certification
- [x] #4 Add a CI guard on the prompt-asset hashes stitch_eval already computes (SKILL.md, drift-reconciler.md), flagging prompt changes as needing a manual Tier-2 run
- [x] #5 Add a --no-agent fast mode scoring deterministic output without token spend; document the harness prominently
- [ ] #6 Fixtures come primarily from the .17 golden harvest (graded real runs with provenance); hand-authored fixtures are reserved for the adversarial gaps real work has not hit (the #2 classes: multi-umbrella, deep-chain, fan-out, seeds-only false-positive)
- [x] #7 Any LLM description-quality judge is calibrated against the human grades corpus (.17 AC#3) before its verdicts gate anything, and re-calibrated whenever the judge model or prompt changes

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

The stitch eval now scores judgement, not just structural collapse, and its prompt assets are CI-guarded. `score_observed` (exported, pure, unit-tested over synthetic stores) matches expected umbrellas to observed multi-seed flows as an exact partition — set-equality per umbrella, no observed umbrella unmatched, no flow satisfying two expectations — so fragmented, merged, or surplus results fail even when flow counts coincide, and `kind: "stitch"` demands a bridge whose endpoints both live inside each umbrella. Description scoring layers two checks over `source === "llm"`: the name-restatement floor (`description_quality.ts` — reject only when every content word derives from the member's own name via exact/inflected/shared-prefix matching with a ≥3-char guard; "Handles create." for `handle_create` fails, real prose passes) and per-anchor `expected_description_contains` goldens for domain terms a name-echo would lack.

Four adversarial fixtures land with Tier-1 goldens captured from the real bin: `multi_umbrella` (two independent registry-dispatch clusters — the agent must partition, and the exact-partition matcher fails both the mega-merge and the six-singleton decline), `deep_chain` (four hops, every hop a registry lookup — evidence for the tail sits several reads from the seed), `fan_out` (one hub, four handlers — breadth), and `seeds_only_decoy` (maximal surface similarity, zero connecting reference — the seeds-only path's judgement-only decline, with a Tier-1 proof that the evidence bar rejects a claimed bridge between them).

`--no-agent` (`npm run stitch_eval:fast`) runs the deterministic reconcile and scores every hand-authored fixture's pre-stitch floor — pinned fragment count, zero bridges, zero llm descriptions — token-free, with a MODE banner that disclaims judgement coverage; floor-less harvested fixtures are genuinely skipped with a note, never failed. The prompt-asset pin (`assets/prompt_asset_pins.json`, 12-hex via the single hashing rule in `prompt_assets.ts` shared by report header, pin, and guard) fails CI on any SKILL.md/drift-reconciler.md edit with a message carrying both hashes and the re-certification loop; `npm run stitch_eval:pin` refreshes it after the Tier-2 run. The two-model convention: haiku is the routine regression gate and the permanent default; any other model stamps `CERTIFICATION RUN` in the report — explicit, human-initiated, never automated, never CI — also warranted when the production session model changes under an unchanged prompt. `docs/stitch_eval.md` documents the modes, taxonomy, scoring contract, pin workflow, and how to author a fixture; the README section points at it.

Review (7 lenses) drove: the harvested-fixture skip under `--no-agent` (the code had failed what its own message and the manifest doc promised to skip — corroborated by six lenses), the kind-aware manifest wrap (a harvested decline's members no longer become an unmatchable umbrella), the ≥3-char prefix guard, the relaxed `"regist"` golden, resilient pin reading, bridge endpoint-pair goldens, the extracted-and-tested certification annotation, timeout-aware deterministic diagnostics, and the doc corrections (npm `--` separators, certification terminology, the authoring guide).

**Deferrals.** AC#6 (fixtures primarily from the .17 harvest) waits with the .17 harvest itself — deferred until organically captured, human-graded bergamot runs exist; the harvested-manifest loader, the skip semantics, and the decline wrap are already in place for that corpus. AC#7 is checked as the standing gate it states: no LLM description-quality judge ships, and `docs/stitch_eval.md` + `docs/contracts/judge_calibration.md` bind any future judge to calibration against the human grades corpus via `drift-calibrate` before its verdicts gate anything.
<!-- SECTION:NOTES:END -->
