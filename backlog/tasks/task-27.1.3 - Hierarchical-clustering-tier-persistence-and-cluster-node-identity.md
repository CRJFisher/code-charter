---
id: TASK-27.1.3
title: "Hierarchical clustering, tier persistence, and deterministic cluster-node identity"
status: To Do
assignee: []
created_date: "2026-05-31"
labels:
  - architecture
  - graph-db
  - graphology
  - clustering
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.1.2
  - task-27.0.4
  - task-25
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The entangled core of the comprehension map: build the multi-level containment hierarchy, persist it so placement is stable, and give each cluster node a deterministic identity that survives a non-deterministic re-cluster without losing user-authored content. These three concerns are interlocking and are deliberately solved as **one** task — the preservation mechanism depends on stable cluster ids, stable ids depend on the identity scheme, and the persistence shape must satisfy task-27.0's no-`ALTER` policy.

The delivered clustering (`packages/vscode/src/clustering/*`) is a single **flat** spectral partition (`findOptimalClusters` → `string[][]`), not a containment dendrogram. This task builds the hierarchy as net-new algorithm work on top of that flat primitive, and lifts the host-neutral clustering logic into `packages/core` so it runs whole-repo without the vscode/tfjs coupling.

It also realizes the parent's **composition decision**: the developer's own structure (functions → files → directories → language built-in modules) is the deterministic lower scaffold, and semantic clustering builds the architectural tiers **above** the module level — consuming task-25's `ModuleResolver` for the given-structure grouping.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 The host-neutral clustering logic is moved into `packages/core` and runs without the tfjs/vscode dependencies; the call contract is generalized from per-entrypoint (`cluster_code_tree(top_level_symbol)`) to whole-repo (all nodes in the post-processed graph)
- [ ] #2 A multi-level containment hierarchy is produced by applying the existing flat-cluster primitive **recursively** — re-cluster any partition whose node+edge count exceeds `MAX_COMPLEXITY_PER_LEVEL` until every partition is within budget; the number of levels is emergent and every level is within budget
- [ ] #3 **Composition:** the lower tiers use task-25's `ModuleResolver` given structure (functions → files → directories → built-in modules); semantic clustering builds the tiers above the module level. Every node carries a behaviour description (from task-27.1.6) so a level reads as behaviour, not a bare directory listing
- [ ] #4 Tier assignment + membership are persisted as agentic-tier `agentic.group` node rows + `agentic.contains` edges, keyed on the graph content hash, with **no schema migration** (`kind`/`origin` on `NodeRow` and `kind` on `EdgeRow` are already open-valued; no new table)
- [ ] #5 **Deterministic cluster-node identity:** a cluster node's stable id is a canonical hash of the sorted set of its member-leaf anchors; a re-cluster re-emits the same id when membership (by sorted anchors) is identical
- [ ] #6 **Membership remap:** when membership changed but overlaps an existing cluster ≥50%, user-owned fields are re-attached from the old id to the new id rather than stranded (the cluster-node analogue of the resolver's `relocated` verdict); a substantially-changed cluster emits a new id with `merged_from`/`split_from` provenance
- [ ] #7 A user-owned field on a cluster node survives a `rebuild_layer('agentic')` re-cluster via the identity + remap (extending task-27.1.2's leaf preservation to cluster nodes); no user-authored cluster label/description is ever hard-deleted

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. **Lift + generalize:** move the host-neutral parts of `clustering_logic.ts`/`cluster_graph.ts` into `packages/core`; keep `findOptimalClusters` as the leaf primitive; replace the per-entrypoint input with the whole post-processed graph. The genuine reuse is the embedding computation + similarity/adjacency matrix + `findOptimalClusters`.
2. **Module scaffold:** consume task-25's `ModuleResolver` to assign the deterministic lower tiers (file → directory → built-in module); these tiers need no clustering.
3. **Recursive cut:** above the module level, run the flat-cluster primitive recursively, re-clustering any over-budget partition until all are within `MAX_COMPLEXITY_PER_LEVEL`.
4. **Persist** the hierarchy as `agentic.group` rows + `agentic.contains` edges keyed on graph content hash; emit `agentic.contains` for task-27.1.5's up-propagation walk.
5. **Identity:** compute the member-anchor-set hash for each cluster; on rebuild, match by identical membership (re-emit id) or ≥50% overlap (remap + re-attach user fields) or new id with `merged_from`/`split_from`.
6. Tests: recursive cut stays within budget; emergent level count on a fixture; deterministic id across two clustering runs; remap preserves a user-owned cluster label across a re-cluster; no `ALTER`.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
