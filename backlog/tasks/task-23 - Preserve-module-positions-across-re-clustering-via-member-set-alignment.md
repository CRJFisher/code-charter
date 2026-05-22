---
id: TASK-23
title: Preserve module positions across re-clustering via member-set alignment
status: To Do
assignee: []
created_date: "2026-05-22 11:58"
labels: []
dependencies:
  - TASK-22
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Today, when a chart's graph content hash changes, all position overrides are discarded together. This causes module-group positions to reset on any source edit that affects the chart's reachable function set, including minor edits like adding a comment or renaming a single function. Add a cluster-alignment pass that, on a content-hash mismatch, compares the cluster membership snapshot at save time to the cluster membership in the current graph and transfers each saved module's position to the current cluster with the highest member-set overlap. Module positions are then preserved across small source changes while function positions remain governed by the existing all-or-nothing content hash gate. The ChartPositions document gains a per-module member-keys snapshot field and the schema_version is bumped; documents saved under the previous schema_version are discarded on load.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 At save time the chart document captures a snapshot of every module-group's composite member keys
- [ ] #2 Member keys in the snapshot are derived from a composite of kind, file path, and name so they survive line-shift edits in the source
- [ ] #3 At load time, when the stored graph_content_hash does not match the current graph, the cluster-alignment pass runs
- [ ] #4 The cluster-alignment pass matches each current module-group to the best-overlapping saved snapshot by Jaccard similarity over composite member keys
- [ ] #5 A current module-group whose best overlap meets or exceeds a documented threshold inherits the position from the matching saved snapshot
- [ ] #6 Module-groups whose best overlap falls below the threshold receive fresh auto-layout positions
- [ ] #7 Brand-new module-groups with no matching saved snapshot receive fresh auto-layout positions
- [ ] #8 Function-node positions remain governed by the existing all-or-nothing graph_content_hash gate and are not affected by cluster-alignment matching
- [ ] #9 The schema version is bumped and chart documents from the previous version are discarded on load
- [ ] #10 Automated tests cover exact match, near-match above threshold, near-match below threshold, brand-new cluster, removed cluster, and line-shift-only changes
<!-- AC:END -->
