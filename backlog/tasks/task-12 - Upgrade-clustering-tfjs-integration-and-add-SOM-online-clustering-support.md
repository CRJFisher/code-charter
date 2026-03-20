---
id: task-12
title: Upgrade clustering-tfjs integration and add SOM online clustering support
status: To Do
assignee: []
created_date: '2026-03-19'
labels: []
dependencies:
  - task-11
---

## Description

Upgrade code-charter's clustering-tfjs dependency from v0.1.3 to v0.4.0, fix the critical API mismatch bug (result.labels vs result.optimal.labels masked by an incorrect custom .d.ts), introduce a clustering adapter abstraction layer, add SOM (Self-Organizing Map) support for online/incremental re-clustering as code changes, and expose algorithm selection to users via VS Code settings. This task synthesizes findings from 15 parallel research and planning agents that investigated the clustering-tfjs library API, all available algorithms, and the integration architecture needed.

## Acceptance Criteria

- [ ] Delete the outdated custom clustering-tfjs.d.ts that masks a runtime bug where result.labels should be result.optimal.labels
- [ ] Upgrade clustering-tfjs dependency from ^0.1.0 to ^0.4.0 in packages/vscode/package.json
- [ ] Delete clustering_service_old.ts dead code
- [ ] Fix result.labels to result.optimal.labels in clustering_service.ts
- [ ] Create a clustering_adapter.ts abstraction layer that wraps clustering-tfjs behind a ClusteringConfig/ClusteringResult interface and handles Clustering.init() initialization
- [ ] Add ClusteringAlgorithm and ClusteringConfig and ClusteringResult types to @code-charter/types
- [ ] Refactor clustering_service.ts to use the adapter instead of direct findOptimalClusters import
- [ ] Add VS Code settings for clusteringAlgorithm (spectral/kmeans/agglomerative/som) with spectral as default
- [ ] Add SOM-based clustering option using a 2-phase approach: SOM fit then agglomerative grouping on weight vectors to produce final NodeGroup clusters
- [ ] Implement incremental re-clustering via SOM partialFit() hooked into AriadneProjectManager.onCallGraphChanged events
- [ ] Add SOM state persistence via saveToJSON/loadFromJSON for instant clustering on project reopen
- [ ] Replace the pure JS cosine similarity loop in createSimilarityMatrix with tensor-based batch computation
- [ ] Add per-cluster color assignments in react_flow_data_transform.ts replacing the hardcoded gray
- [ ] Add cluster quality metrics (silhouette score) to the NodeGroup metadata returned to the UI
- [ ] Write unit tests for extracted pure clustering logic functions
- [ ] Write integration tests for the findOptimalClusters contract against the new library version
- [ ] Verify @tensorflow/tfjs-node is loaded at runtime for 5-20x performance over pure JS backend

## Implementation Plan

### Research Summary

15 parallel Opus agents investigated the clustering-tfjs library (5 researchers) and planned the code-charter integration (10 planners). Key findings:

**Library State (clustering-tfjs at ~/workspace/clustering-js):**
- Source version: 0.4.0 | Installed in code-charter: 0.1.3 (severely outdated)
- 4 algorithms: KMeans, SpectralClustering, AgglomerativeClustering, SOM (Self-Organizing Maps)
- SOM is the "online/neural" clustering — a competitive learning neural network on a 2D grid with `partialFit()` for incremental learning, `enableStreamingMode()` for continuous learning, and `saveToJSON()`/`loadFromJSON()` for state persistence
- SOM was added Sept 2025 in a 192k-line commit implementing task-33 with 18+ sub-tasks
- No density-based methods (DBSCAN/HDBSCAN) exist — and they're not recommended due to curse of dimensionality at 384/1536 embedding dimensions

**Critical Bug Found:**
- code-charter has a custom `clustering-tfjs.d.ts` declaring `findOptimalClusters` returns `{ labels, nClusters }` but the actual API returns `{ optimal: ClusterEvaluation, evaluations: ClusterEvaluation[] }` — code accesses `result.labels` which would be `undefined` at runtime. This bug is masked by the incorrect type override.

**Algorithm Evaluation Consensus:**
- **Spectral (current default)**: Architecturally correct for graph data (call graph + embedding similarity). Keep as default.
- **K-Means**: Useful as a fast preview/fallback (~30ms vs spectral's ~300ms for 100 functions) and for multi-algorithm comparison. NOT suitable as replacement since it doesn't natively handle graph/similarity matrices.
- **Agglomerative**: Adds real value — code is inherently hierarchical. Enables progressive disclosure via zoom levels. Deterministic. Performance fine for typical sizes (10-100 nodes). Needs merge distance recording added to clustering-js for dendrogram cutting.
- **SOM (recommended new addition)**: Enables live-updating cluster boundaries as developer codes. `partialFit()` takes ~5-20ms for 1-5 changed embeddings. State persistence enables instant clustering on project reopen. Requires a secondary grouping step (agglomerative on weight vectors) since raw SOM produces too many initial clusters.
- **DBSCAN/HDBSCAN**: Not implemented and not recommended. Curse of dimensionality makes density-based methods ineffective at 384-1536 dimensions.

**Performance Analysis:**
- Memory is NOT a concern at code-charter's scale (peak ~630KB-3.8MB for 100-300 functions)
- TF.js backend selection is the critical performance factor: `@tensorflow/tfjs-node` gives 5-20x speedup over pure JS
- The `findOptimalClusters` sweep (testing k=2..12) multiplies base clustering time by 11 — consider fast KMeans preview while spectral runs
- Pure JS cosine similarity loop should be replaced with tensor-based batch computation

### Phase 1: Fix Foundation (Critical Bugs + Dead Code)

1. Delete `packages/vscode/src/clustering/clustering-tfjs.d.ts` (incorrect type override masking runtime bug)
2. Delete `packages/vscode/src/clustering/clustering_service_old.ts` (dead code)
3. Fix `clustering_service.ts` line 135: `result.labels` → `result.optimal.labels`
4. Upgrade `clustering-tfjs` dependency in `packages/vscode/package.json` from `^0.1.0` to `^0.4.0`
5. Add `Clustering.init()` call for explicit backend initialization
6. Verify `@tensorflow/tfjs-node` loads at runtime (log which backend is active)

**Key files:**
- `packages/vscode/src/clustering/clustering_service.ts`
- `packages/vscode/src/clustering/clustering-tfjs.d.ts` (delete)
- `packages/vscode/src/clustering/clustering_service_old.ts` (delete)
- `packages/vscode/package.json`

### Phase 2: Abstraction Layer + Types

1. Add clustering types to `packages/types/src/clustering.ts`:
   - `ClusteringAlgorithm = 'spectral' | 'kmeans' | 'agglomerative' | 'som'`
   - `ClusteringConfig` (algorithm, min/max clusters, algorithm params, metrics, scoring)
   - `ClusteringResult` (labels, n_clusters, scores with silhouette/CH/DB, all evaluations)
2. Create `packages/vscode/src/clustering/clustering_adapter.ts`:
   - Wraps `clustering-tfjs` behind `ClusteringConfig`/`ClusteringResult`
   - Handles `Clustering.init()` singleton initialization
   - Memory monitoring (log `tf.memory()` before/after)
   - Maps config to `findOptimalClusters` options
3. Refactor `clustering_service.ts` to use adapter instead of direct `findOptimalClusters` import
4. Add VS Code settings in `packages/vscode/package.json`:
   - `code-charter-vscode.clusteringAlgorithm` (enum: spectral/kmeans/agglomerative/som, default: spectral)
   - `code-charter-vscode.clusteringMaxClusters` (number, default: 12)

**Key files:**
- `packages/types/src/clustering.ts` (new)
- `packages/types/src/index.ts` (add export)
- `packages/vscode/src/clustering/clustering_adapter.ts` (new)
- `packages/vscode/src/clustering/clustering_service.ts` (refactor)
- `packages/vscode/package.json` (settings)

### Phase 3: SOM Online Clustering Integration

1. Add SOM-based clustering in the adapter:
   - Grid size heuristic: `ceil(sqrt(n * 2))` for grid dimension
   - Use hexagonal topology, gaussian neighborhood, PCA initialization
   - 2-phase: SOM `fit()` on embeddings, then agglomerative clustering on weight vectors to produce final groups
2. Implement incremental re-clustering:
   - Create `SomClusteringService` class wrapping a persistent SOM instance
   - On init, check for saved SOM state and `loadFromJSON()` if available
   - Wire `AriadneProjectManager.onCallGraphChanged` to incremental pipeline:
     `changed files → re-embed changed functions → partialFit() → predict() → update NodeGroups → push to UI`
3. Add SOM state persistence:
   - Save trained SOM to `.code-charter/som_state.json` via `saveToJSON()`
   - Load on project reopen for instant clustering via `predict()`
   - Include embedding provider type in state key (384d local vs 1536d OpenAI)
4. Add per-function embedding cache (replacing bulk hash-based cache) to enable granular updates

**Key files:**
- `packages/vscode/src/clustering/clustering_adapter.ts` (extend with SOM)
- `packages/vscode/src/clustering/clustering_service.ts` (incremental support)
- `packages/vscode/src/extension.ts` (wire onCallGraphChanged to re-clustering)
- `packages/vscode/src/ariadne/project_manager.ts` (expose which functions changed)

### Phase 4: Performance Optimizations

1. Replace pure JS cosine similarity loop in `createSimilarityMatrix()` with tensor-based batch computation: `tf.matMul(embeddings, embeddings.transpose())` normalized by vector norms
2. Include call graph structure hash in cluster cache key (currently only hashes summaries, missing adjacency signal)
3. Consider semantic correctness: code-charter passes a precomputed similarity matrix but tells the library to build k-NN affinity on top of it — evaluate whether `affinity: 'precomputed'` would be more correct

**Key files:**
- `packages/vscode/src/clustering/clustering_service.ts`

### Phase 5: UI Enhancements

1. Add per-cluster colors in `react_flow_data_transform.ts`:
   - Define a palette of 12 distinguishable color pairs (border + background) for both light and dark themes in `theme_config.ts`
   - Replace hardcoded `backgroundColor: "rgba(240, 240, 240, 0.3)"` and `border: "2px dashed #cccccc"`
   - Add `cluster_index` to `ModuleNodeData`
2. Add cluster quality metadata to `NodeGroup`:
   - Extend with optional `metadata?: { algorithm_used: string; quality_score?: number; cluster_index: number }`
   - Display silhouette score in `ModuleGroupNodeComponent`
3. Optional: Add a cluster quality badge in the flow canvas overlay showing cluster count, algorithm, and quality score

**Key files:**
- `packages/ui/src/components/code_chart_area/react_flow_data_transform.ts`
- `packages/ui/src/components/code_chart_area/zoom_aware_node.tsx`
- `packages/ui/src/components/code_chart_area/theme_config.ts`
- `packages/types/src/backend.ts` (extend NodeGroup)

### Phase 6: Testing

1. Extract pure clustering functions from `ClusteringService` into testable `clustering_logic.ts`:
   - `cosine_similarity`, `create_similarity_matrix`, `create_adjacency_matrix`, `create_combined_matrix`, `group_clusters_by_label`, `order_clusters_by_centroid`
2. Write unit tests for all extracted pure functions
3. Write integration tests for `findOptimalClusters` contract:
   - Well-separated clusters → expect correct grouping with silhouette > 0.5
   - Two disconnected components → expect 2 clusters
   - Minimal data (3-4 functions) → verify maxClusters capping
   - Verify scoring function receives correct `ClusterEvaluation` shape
4. Write regression test with golden data fixture from a real code-charter run
5. Fix vscode package Jest config (remove conflicting Babel deps, use ts-jest)
6. Update `mock_backend.test.ts` to test current `CodeCharterBackend` interface

**Key files:**
- `packages/vscode/src/clustering/clustering_logic.ts` (new, extracted pure functions)
- `packages/vscode/src/clustering/__tests__/clustering_logic.test.ts` (new)
- `packages/vscode/src/clustering/__tests__/clustering_integration.test.ts` (new)
- `packages/vscode/jest.config.js` (fix)

### Architecture Decision: Why SOM for Online Clustering

The SOM is the only algorithm in clustering-tfjs with online/incremental learning support. It enables a fundamentally different UX:

1. **Current (batch)**: User manually triggers clustering → waits for full pipeline → sees result
2. **With SOM (incremental)**: Clustering updates live as the developer codes, with ~5-20ms incremental updates well within the existing 500ms debounce window in AriadneProjectManager

The SOM requires a secondary grouping step because raw SOM neuron count (gridW × gridH) exceeds the desired cluster count. The recommended approach is agglomerative clustering on the SOM weight vectors, which is fast (O(m^3) where m = number of neurons, typically 25-49) and deterministic.

### Architecture Decision: Spectral Remains Default

Spectral clustering is architecturally correct for code-charter because:
- The data is inherently a graph (call graph + similarity graph)
- Spectral clustering operates natively on graph structures via the Laplacian
- It handles non-convex cluster shapes common in embedding space
- The existing `findOptimalClusters` sweep automatically selects optimal k

SOM becomes the recommended choice when users want live-updating clusters or have large codebases where spectral's O(n²) cost is noticeable.
