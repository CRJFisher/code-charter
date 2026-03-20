/**
 * Clustering adapter that wraps clustering-tfjs behind a clean interface.
 * Handles config mapping and result normalization.
 */

import {
  findOptimalClusters,
  type ClusterEvaluation as LibClusterEvaluation,
  type FindOptimalClustersOptions,
} from "clustering-tfjs";
import type {
  ClusteringConfig,
  ClusteringResult,
  ClusteringScores,
  ClusterEvaluation,
} from "@code-charter/types";

/**
 * Log TF.js memory usage for diagnostics.
 */
function log_memory(label: string): void {
  try {
    const tf = require("@tensorflow/tfjs-node");
    const mem = tf.memory();
    console.log(
      `[clustering-adapter] ${label}: tensors=${mem.numTensors}, bytes=${mem.numBytes}`
    );
  } catch {
    // tfjs-node not available, skip memory logging
  }
}

/**
 * Map our ClusteringConfig to clustering-tfjs FindOptimalClustersOptions.
 */
function map_config_to_options(
  config: ClusteringConfig
): FindOptimalClustersOptions {
  const options: FindOptimalClustersOptions = {
    minClusters: config.min_clusters ?? 2,
    maxClusters: config.max_clusters,
    algorithm: config.algorithm,
    metrics: map_metrics(config.metrics),
  };

  if (config.algorithm_params) {
    const params = config.algorithm_params as Record<string, unknown>;
    const mapped: Record<string, unknown> = {};

    if ("affinity" in params) mapped.affinity = params.affinity;
    if ("gamma" in params) mapped.gamma = params.gamma;
    if ("n_neighbors" in params) mapped.nNeighbors = params.n_neighbors;
    if ("linkage" in params) mapped.linkage = params.linkage;
    if ("metric" in params) mapped.metric = params.metric;
    if ("max_iter" in params) mapped.maxIter = params.max_iter;
    if ("n_init" in params) mapped.nInit = params.n_init;
    if ("tol" in params) mapped.tol = params.tol;

    options.algorithmParams = mapped;
  }

  if (config.scoring_function) {
    const user_scoring = config.scoring_function;
    options.scoringFunction = (evaluation: LibClusterEvaluation) => {
      const scores: ClusteringScores = {
        silhouette: evaluation.silhouette,
        davies_bouldin: evaluation.daviesBouldin,
        calinski_harabasz: evaluation.calinskiHarabasz,
        combined_score: evaluation.combinedScore,
      };
      return user_scoring(scores);
    };
  }

  return options;
}

/**
 * Map our snake_case metrics to library camelCase metrics.
 */
function map_metrics(
  metrics?: string[]
): Array<"silhouette" | "daviesBouldin" | "calinskiHarabasz"> | undefined {
  if (!metrics) return undefined;
  const metric_map: Record<string, "silhouette" | "daviesBouldin" | "calinskiHarabasz"> = {
    silhouette: "silhouette",
    davies_bouldin: "daviesBouldin",
    calinski_harabasz: "calinskiHarabasz",
  };
  return metrics
    .filter((m) => m in metric_map)
    .map((m) => metric_map[m]);
}

/**
 * Map a library ClusterEvaluation to our domain type.
 */
function map_evaluation(evaluation: LibClusterEvaluation): ClusterEvaluation {
  return {
    k: evaluation.k,
    scores: {
      silhouette: evaluation.silhouette,
      davies_bouldin: evaluation.daviesBouldin,
      calinski_harabasz: evaluation.calinskiHarabasz,
      combined_score: evaluation.combinedScore,
    },
    labels: Array.isArray(evaluation.labels)
      ? evaluation.labels
      : Array.from(evaluation.labels),
  };
}

/**
 * Run standard clustering (kmeans, spectral, agglomerative) via findOptimalClusters.
 */
async function run_standard_clustering(
  data: number[][],
  config: ClusteringConfig
): Promise<ClusteringResult> {
  const options = map_config_to_options(config);
  const result = await findOptimalClusters(data, options);

  const optimal = result.optimal;
  const labels: number[] = Array.isArray(optimal.labels)
    ? optimal.labels as number[]
    : Array.from(optimal.labels as Iterable<number>);

  return {
    labels,
    n_clusters: optimal.k,
    scores: {
      silhouette: optimal.silhouette,
      davies_bouldin: optimal.daviesBouldin,
      calinski_harabasz: optimal.calinskiHarabasz,
      combined_score: optimal.combinedScore,
    },
    all_evaluations: result.evaluations.map(map_evaluation),
  };
}

/**
 * Main entry point: run clustering with the given config.
 */
export async function run_clustering(
  data: number[][],
  config: ClusteringConfig
): Promise<ClusteringResult> {
  log_memory("before clustering");

  const result = await run_standard_clustering(data, config);

  log_memory("after clustering");
  return result;
}
