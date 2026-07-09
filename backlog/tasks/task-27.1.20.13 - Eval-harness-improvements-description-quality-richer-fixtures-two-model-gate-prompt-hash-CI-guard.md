---
id: TASK-27.1.20.13
title: >-
  Eval harness improvements: description quality, richer fixtures, two-model
  gate, prompt-hash CI guard
status: To Do
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

- [ ] #1 Add a description-quality scoring pass: heuristic name-restatement rejection, or expected_description_contains goldens
- [ ] #2 Add multi-umbrella / deep-chain / fan-out / seeds-only-false-positive fixtures
- [ ] #3 Adopt a two-model convention: haiku regression gate + periodic production-representative certification
- [ ] #4 Add a CI guard on the prompt-asset hashes stitch_eval already computes (SKILL.md, drift-reconciler.md), flagging prompt changes as needing a manual Tier-2 run
- [ ] #5 Add a --no-agent fast mode scoring deterministic output without token spend; document the harness prominently
- [ ] #6 Fixtures come primarily from the .17 golden harvest (graded real runs with provenance); hand-authored fixtures are reserved for the adversarial gaps real work has not hit (the #2 classes: multi-umbrella, deep-chain, fan-out, seeds-only false-positive)
- [ ] #7 Any LLM description-quality judge is calibrated against the human grades corpus (.17 AC#3) before its verdicts gate anything, and re-calibrated whenever the judge model or prompt changes

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Depends on .12 (enriched inventory + coverage reporting change eval expectations). stitch_eval already computes the prompt-asset hashes the CI guard needs.
<!-- SECTION:NOTES:END -->
