---
id: TASK-25
title: Display file-based and semantic module views with configurable default
status: To Do
assignee: []
created_date: "2026-05-24 12:09"
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

> **Archived (superseded by task-27.1).** The core idea — the developer's existing file as the first parent layer above function/method leaves, with directory rollups above — was folded directly into the task-27.1 comprehension map: the file-module tier in **task-27.1.2** and directory rollups + a one-function `ModuleResolver` seam in **task-27.1.3**, both as a deterministic GROUP-BY over the file already encoded in each leaf anchor (`<file_path>#<name>:<kind>`). The rest of this task — the Files/Clusters segmented-control toggle, the per-user/per-workspace `defaultModuleView` setting, last-selection memory, mode-namespaced positions, and the deferred Compare view — was tied to the per-entrypoint call-tree experience and is not part of the whole-repo map, so it is not carried forward.

Today the chart shows a single 'module' grouping derived from semantic clustering (clustering-tfjs on docstring embeddings + call-graph adjacency). This conflates two distinct things: the modules the developer already wrote (files) and the modules an analysis tool would suggest. Showing only the suggested grouping hides the comparison that makes the tool actually useful — when the two diverge, that gap is a refactoring signal.

This task introduces a second module-detection mode that uses the file each symbol lives in as the module ('Files' view), keeps the existing semantic clustering as a peer ('Clusters' view), and lets the user switch between them. The default is configurable per user and per workspace. A future 'Compare' view (handled by a separate task) will visualise the diff between the two; this task explicitly does not implement that view.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Chart shows a floating segmented control with two options: Files and Clusters
- [ ] #2 Files view groups every reachable symbol by the workspace-relative file path of its definition
- [ ] #3 Clusters view continues to use the existing semantic clustering pipeline unchanged
- [ ] #4 Switching between views animates the regrouping (~400ms) and preserves leaf-node identity and pan/zoom
- [ ] #5 Workspace-level VSCode setting code-charter-vscode.defaultModuleView controls the initial view for a workspace (enum: files, clusters)
- [ ] #6 User-level VSCode setting of the same key provides a personal default that workspaces inherit unless overridden
- [ ] #7 The user's last selection within a workspace is remembered via vscode.ExtensionContext.workspaceState and takes precedence on subsequent opens within that session boundary
- [ ] #8 Files-view module label is the file path relative to the entrypoint's directory (basenames disambiguated by minimal needed prefix)
- [ ] #9 Files-view computes purely in-memory in O(n_symbols) with no embedding model or clustering library invocation
- [ ] #10 Files-view does not write to the clusters or embeddings cache; Clusters-view caching remains as-is and is keyed by (entrypoint, mode) so toggling does not invalidate prior results
- [ ] #11 Symbols whose definition file path resolves outside the workspace are bucketed under a single synthetic module labelled <external>
- [ ] #12 Persisted node positions are namespaced by (entrypoint, mode) so toggling views never clobbers the other view's layout (coordinates with TASK-22, TASK-23 storage schema)
- [ ] #13 Module derivation is encapsulated behind a single ModuleResolver-style interface so a later language-aware unit (Rust mod, Java class, directory-depth rollup) can be added without restructuring callers
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Audit the existing clustering pipeline (extension.ts:148-177 clusterCodeTree handler, ClusteringService, build_cluster_graph) and confirm string[][] is the contract between clustering and the rest of the chart pipeline.
2. Define a ModuleResolver interface in @code-charter/types with a single method resolve(call_tree: Record<string, CallableNode>): string[][]; both 'files' and 'clusters' resolvers implement it.
3. Implement FilesModuleResolver: groupBy on node.definition.location.file_path, normalize to workspace-relative POSIX path; bucket out-of-workspace into <external>; sort clusters alphabetically by path for deterministic output.
4. Wrap the existing ClusteringService.cluster(...) behind ClustersModuleResolver implementing the same interface.
5. Add the VSCode contributed setting code-charter-vscode.defaultModuleView (enum files|clusters, default files). Add a workspaceState read for lastModuleView that takes precedence.
6. Extend the position storage schema (per TASK-22, TASK-23) to namespace positions by (entrypoint, mode). Coordinate with whichever of those tasks lands the schema; if both still in flight, propose the schema in this task and implement against it.
7. Update clusterCodeTree message handling to receive a 'mode' argument and dispatch to the chosen resolver. Update the webview to pass the current mode.
8. Add the segmented control to the chart canvas (top-left, floating, two segments). Selecting a segment posts the mode to the extension host, persists last-selection, and triggers re-render.
9. Implement the regrouping transition: keep symbol nodes mounted, animate parent-module containers.
10. Verify in both VSCode extension and the web-demo backend mock that switching works end-to-end without recomputing semantic embeddings on each toggle.
11. Tests: FilesModuleResolver determinism, out-of-workspace bucketing, single-file project edge case, mode-namespaced position read/write.
<!-- SECTION:PLAN:END -->
