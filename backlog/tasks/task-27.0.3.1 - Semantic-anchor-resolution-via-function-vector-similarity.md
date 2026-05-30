---
id: TASK-27.0.3.1
title: "Semantic anchor resolution via function-vector similarity"
status: To Do
assignee: []
created_date: "2026-05-30"
labels:
  - enhancement
  - ariadne
  - embeddings
  - graph-db
dependencies:
  - task-27.0.3
parent_task_id: TASK-27.0.3
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

An optional enhancement to the resolver (task-27.0.3) for its hardest case: an element that was **both moved/renamed and edited**, so neither `symbol_path` nor `content_hash` matches and deterministic resolution returns a low-confidence downgrade or an outright miss. Today such content lands in task-27.1's re-attachment bin for manual repair.

The enhancement adds a semantic signal: each function/method body is embedded and stored in a local vector index; when deterministic matching is ambiguous, candidate symbols are ranked by **cosine similarity**, and that similarity becomes one input to a blended confidence score (alongside name, graph-proximity, and structural signals) that picks the best re-anchor candidate. The extension already runs a function-embedding pipeline for clustering, so the vectors are largely a reuse rather than new infrastructure.

This is a deferred enhancement: the v1 resolver in task-27.0.3 is fully functional without it.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Each function/method node has a body embedding persisted in a local vector index, reusing the extension's existing embedding pipeline where possible
- [ ] #2 When the deterministic resolver yields a `miss` or an ambiguous `downgrade`, candidate symbols are ranked by cosine similarity and the top candidate's similarity contributes to a blended confidence score; a configurable threshold decides downgrade-vs-miss
- [ ] #3 The similarity is one input to the confidence score, never the sole decider — a deterministic exact `symbol_path`+`content_hash` match always wins outright
- [ ] #4 The enhancement is isolated behind the resolver and adds no new dependency to `@code-charter/types`; with it disabled, task-27.0.3's behaviour is unchanged
- [ ] #5 On a fixture of moved+renamed+edited functions, it recovers a measurable fraction of anchors that deterministic resolution alone misses, with no regression on exact/clean cases

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Reuse the existing transformers.js function embeddings (from the clustering pipeline) keyed by symbol; persist vectors in a local index (a SQLite BLOB column + in-JS cosine, or sqlite-vec if warranted).
2. On an ambiguous/miss resolution, query top-k nearest symbols by cosine similarity.
3. Blend similarity with the existing name/proximity/structural signals into a single confidence score; apply a configurable threshold for the downgrade-vs-miss decision.
4. Gate the whole path behind a flag so the deterministic resolver is the default; evaluate recovery rate and false-match rate on a moved+renamed+edited fixture.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
