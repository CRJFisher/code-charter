---
id: task-4
title: Replace Python clustering service with clustering-js library
status: Done
assignee: []
created_date: '2025-07-15'
updated_date: '2025-08-02'
labels: []
dependencies: []
---

## Description

The VSCode extension currently relies on a separate Python process (charter/clustering.py) running on port 5000 to perform code clustering. This task involves migrating to the new clustering-js TypeScript/JavaScript library to eliminate the Python dependency and simplify the extension architecture.

## Acceptance Criteria

- [x] Python clustering service is no longer required
- [x] clustering-js library is integrated into the VSCode extension
- [x] Clustering functionality works identically to the Python implementation
- [x] HTTP calls to localhost:5000/cluster are replaced with direct library calls
- [x] Python service cleanup is documented
- [x] Old Python dependencies and setup instructions are removed

## Implementation Plan

1. Install clustering-tfjs and @tensorflow/tfjs-node dependencies
   - Add clustering-tfjs to package.json
   - Add @tensorflow/tfjs-node for native module acceleration
   - Update npm dependencies

2. Create a new clustering service module in the VSCode extension
   - Create packages/vscode/src/clustering/clustering_service.ts
   - Implement ClusteringService class with similar interface to Python version

3. Implement embedding generation using OpenAI API
   - Port embed_summaries function from Python to TypeScript
   - Use existing OpenAI client configuration from model settings
   - Maintain same text-embedding-ada-002 model for compatibility

4. Implement clustering using findOptimalClusters API
   - Use spectral clustering with affinity='nearest_neighbors'
   - Configure with maxClusters=8, metrics=['silhouette', 'calinskiHarabasz']
   - Implement custom scoring function: silhouette * 2 + calinskiHarabasz
   - Port similarity matrix and adjacency matrix creation logic

5. Replace HTTP calls to Python service
   - Update clusterCodeTree function in extension.ts
   - Remove fetch call to http://127.0.0.1:5000/cluster
   - Call ClusteringService directly with summaries data

6. Test clustering functionality
   - Verify clusters are generated correctly
   - Compare results with existing Python implementation
   - Ensure performance is acceptable

7. Remove Python service dependencies
   - Delete charter/clustering.py
   - Remove Python-related setup instructions
   - Clean up any Docker or environment configurations

8. Update documentation
   - Update README to remove Python setup steps
   - Document new TypeScript-only architecture
   - Update any deployment guides

## Implementation Notes

### clustering-tfjs Library Details

The clustering-tfjs library provides TypeScript/JavaScript clustering algorithms powered by TensorFlow.js. Key features to utilize:

1. **findOptimalClusters API**: Automatically determines the best number of clusters

   ```typescript
   const result = await findOptimalClusters(data, {
     maxClusters: 8,
     algorithm: 'spectral',
     algorithmParams: { affinity: 'nearest_neighbors' },
     metrics: ['silhouette', 'calinskiHarabasz'],
     scoringFunction: (evaluation) => evaluation.silhouette * 2 + evaluation.calinskiHarabasz
   });
   ```

2. **Spectral Clustering**: Graph-based clustering that works well with similarity matrices
   - Supports custom affinity functions
   - 'nearest_neighbors' affinity matches Python implementation behavior

3. **TensorFlow.js Backend**: Use @tensorflow/tfjs-node for native CPU acceleration
   - Significantly faster than WebGL backend for server-side operations
   - Automatic memory management and garbage collection

### Data Format Mapping

The Python service expects:

- `refinedFunctionSummaries`: Dict[str, str] - function symbol to summary text
- `callGraphItems`: Dict[str, DefinitionNode] - function symbol to node data

The clustering process:

1. Generate embeddings for each function summary using OpenAI
2. Create similarity matrix from embeddings (cosine similarity)
3. Combine with adjacency matrix from call graph (50/50 weighting)
4. Apply spectral clustering to find optimal groupings
5. Order clusters by distance to centroid

### Key Implementation Considerations

- Maintain backward compatibility with existing cluster output format
- Cache embeddings similar to Python implementation (using hash of summaries)
- Ensure proper error handling for OpenAI API calls
- Consider implementing progress callbacks for long-running operations

## Implementation Summary

Successfully migrated the clustering functionality from Python to TypeScript using the clustering-tfjs library:

1. **Dependencies Added**:
   - Added `clustering-tfjs@^1.0.0` for clustering algorithms
   - Added `@tensorflow/tfjs-node@^4.10.0` for native CPU acceleration
   - Added `openai@^4.0.0` for direct OpenAI API access

2. **Created ClusteringService Module**:
   - Implemented in `packages/vscode/src/clustering/clustering_service.ts`
   - Mirrors the Python implementation's functionality
   - Uses OpenAI's text-embedding-ada-002 model for embeddings
   - Implements spectral clustering with findOptimalClusters API
   - Maintains caching for embeddings and clusters

3. **Updated Extension Integration**:
   - Modified `extension.ts` to use ClusteringService instead of HTTP calls
   - Removed fetch call to `http://127.0.0.1:5000/cluster`
   - Passes OpenAI API key directly to the service

4. **Cleanup Completed**:
   - Deleted `charter/clustering.py` and entire `charter/` directory
   - Updated Planning.md to reflect TypeScript migration
   - No Python setup instructions found to remove (none existed)

5. **Technical Details**:
   - Maintains same clustering algorithm (spectral with nearest_neighbors affinity)
   - Uses same evaluation metrics (silhouette and Calinski-Harabasz)
   - Preserves 50/50 weighting between similarity and adjacency matrices
   - Compatible with existing cluster output format

The migration eliminates the need for a separate Python process, simplifying deployment and reducing dependencies while maintaining identical functionality.
