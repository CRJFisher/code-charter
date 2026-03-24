/**
 * Supported clustering algorithms.
 * Matches the algorithms available in clustering-tfjs v0.5.0.
 */
export type ClusteringAlgorithm = 'spectral' | 'kmeans' | 'agglomerative';

/**
 * Metrics that can be used to evaluate clustering quality.
 */
export type ClusteringMetric = 'silhouette' | 'calinski_harabasz' | 'davies_bouldin';

/**
 * Algorithm-specific parameters for spectral clustering.
 */
export interface SpectralParams {
  affinity?: 'nearest_neighbors' | 'rbf' | 'precomputed';
  gamma?: number;
  n_neighbors?: number;
}

/**
 * Algorithm-specific parameters for K-means clustering.
 */
export interface KmeansParams {
  max_iter?: number;
  n_init?: number;
  tol?: number;
}

/**
 * Algorithm-specific parameters for agglomerative clustering.
 */
export interface AgglomerativeParams {
  linkage?: 'ward' | 'complete' | 'average' | 'single';
  metric?: 'euclidean' | 'manhattan' | 'cosine';
}

/**
 * Union of algorithm-specific parameter types.
 */
export type AlgorithmParams = SpectralParams | KmeansParams | AgglomerativeParams;

/**
 * Scores from a single clustering evaluation.
 */
export interface ClusteringScores {
  silhouette?: number;
  davies_bouldin?: number;
  calinski_harabasz?: number;
  combined_score?: number;
}

/**
 * A single evaluation at a given k value.
 */
export interface ClusterEvaluation {
  k: number;
  scores: ClusteringScores;
  labels: number[];
}

/**
 * Configuration for a clustering operation.
 */
export interface ClusteringConfig {
  algorithm: ClusteringAlgorithm;
  min_clusters?: number;
  max_clusters: number;
  algorithm_params?: AlgorithmParams;
  metrics?: ClusteringMetric[];
  scoring_function?: (scores: ClusteringScores) => number;
}

/**
 * Result of a clustering operation.
 */
export interface ClusteringResult {
  labels: number[];
  n_clusters: number;
  scores: ClusteringScores;
  all_evaluations: ClusterEvaluation[];
}
