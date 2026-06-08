---
id: TASK-27.1.14
title: "Robust drift anchoring: location-independent symbol identity and fuzzy name matching"
status: To Do
assignee: []
labels:
  - drift
  - resolver
  - ariadne
  - graph-db
  - consistency
dependencies:
  - task-27.0.3
  - task-27.1.6
  - task-27.1.6.4
references:
  - task-27.0.3.1
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
parent_task_id: TASK-27.1
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The drift resolver that carries user-authored content (descriptions, names, pins) across a code change is too brittle: it keys identity on the **`symbol_path` + `content_hash`** pair, and an Ariadne symbol's `symbol_path` is **location-bearing** — it encodes the enclosing scope and position. A function that is **moved unchanged** (same name, same body, new file or new position) therefore gets a new `symbol_path`, the exact match fails, and the resolver downgrades to `relocated` or, worse, `miss` — sending perfectly valid content to the re-attachment bin. The diagram in `docs/comprehension/drift-sync.html` (resolver — anchoring) shows this `miss` surface; the `miss` rate in practice is higher than it should be because pure relocation defeats an exact-path scheme.

This task hardens anchoring with **a blended, fuzzy resolution** so that identity survives the common edits that defeat exact matching — relocation, rename, and small body edits — while keeping a deterministic exact match always-wins.

Three signals, cheapest-first:

1. **Location-independent symbol identity.** Extract the **bare name** (and a location-free identity tuple: bare name + signature/arity + enclosing-symbol name, _not_ file path or line) from the Ariadne symbol, and resolve against that first. A pure move then resolves **exactly** with no fuzzy step at all — the single biggest, cheapest reduction in the `miss` rate.
2. **Edit-distance name tolerance (Levenshtein).** When the bare name changed (a rename), rank candidates by normalized edit distance on the name (plus the structural signals already in `rank_candidates`), so a small rename (`load_cfg` → `load_config`) re-anchors instead of missing.
3. **Code-vector similarity (consumed, not built here).** The semantic body-similarity signal is specified in **task-27.0.3.1** (function-vector cosine similarity, reusing the clustering embedding pipeline of task-24). This task defines the **blended confidence score** that 27.0.3.1's similarity plugs into as one input — it does not build the embedding pipeline.

The signals combine into one confidence score with a configurable downgrade-vs-miss threshold; an exact location-independent-identity + `content_hash` match always wins outright and skips fuzzy ranking entirely.

**Boundary with task-27.0.3.1:** that task adds the _semantic_ signal (embeddings + cosine). This task adds the _deterministic_ signals (location-independent identity + Levenshtein) and owns the _blending framework_ both feed. The two are complementary; this one ships first and stands alone without embeddings.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A location-free identity is extracted from the Ariadne symbol (bare name + arity/signature + enclosing-symbol name, excluding `file_path` and position) and is the primary resolution key; a symbol that is moved unchanged resolves as an **exact** match (verdict not `relocated`/`miss`) with no fuzzy fallback invoked.
- [ ] #2 When the bare name changed, candidates are ranked by normalized Levenshtein distance on the name, blended with the existing `rank_candidates` structural signals; a small rename re-anchors above the configured threshold.
- [ ] #3 A single blended confidence score combines name distance, structural/graph-proximity signals, and (when task-27.0.3.1 is present) vector cosine similarity; a configurable threshold decides `downgrade` vs `miss`. The score is the sole place these signals are combined.
- [ ] #4 A deterministic exact match (location-independent identity + `content_hash`) always wins outright and skips fuzzy ranking — no regression on clean/exact cases.
- [ ] #5 The vector-similarity input is optional: with task-27.0.3.1 absent or disabled, resolution uses signals 1–2 only and behaves deterministically.
- [ ] #6 On a fixture covering moved-unchanged, renamed-only, moved+renamed, and small-body-edit functions, the resolver recovers a measurable majority of anchors that the current exact-path scheme sends to the bin, with no increase in false matches on the exact/clean fixture.
- [ ] #7 The hardening is isolated behind the resolver (`packages/core/src/resolver`) and adds no new dependency to `@code-charter/types`; the drift re-sync path (`re_extract` → resolve) consumes the new verdicts without change to its own logic.

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. **Design** the location-free identity tuple from the Ariadne symbol shape (audit what `from_ariadne.ts` / `resolver_symbol.ts` carry; confirm what is location-bearing). Decide the identity string and where it is computed.
2. Add the location-independent identity as the primary key in `resolve_anchor.ts`, ahead of the existing `symbol_path`+`content_hash` path; verify a pure move now yields an exact verdict.
3. Add normalized Levenshtein name distance as a ranking signal in `rank_candidates.ts`; keep it pure/dependency-light.
4. Introduce the **blended confidence score** as the single combinator (name distance + structural + optional vector cosine), with a configurable threshold for downgrade-vs-miss. Leave a typed seam for task-27.0.3.1's cosine input.
5. Build the fixture (moved-unchanged / renamed-only / moved+renamed / small-body-edit / clean) and measure recovery rate and false-match rate against the current scheme.
6. Update the `docs/comprehension/drift-sync.html` resolver — anchoring diagram to reflect the blended scheme and the reduced `miss` surface.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
