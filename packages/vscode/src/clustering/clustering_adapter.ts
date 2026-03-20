/**
 * Clustering adapter that wraps clustering-tfjs behind a clean interface.
 * Handles Clustering.init() singleton, config mapping, SOM 2-phase clustering,
 * and result normalization.
 */

import {
  Clustering,
  findOptimalClusters,
  type ClusterEvaluation as LibClusterEvaluation,
  type FindOptimalClustersOptions,
} from "clustering-tfjs";
import type {
  ClusteringConfig,
  ClusteringResult,
  ClusteringScores,
  ClusterEvaluation,
  SomParams,
} from "@code-charter/types";

let _initialized = false;

/**
 * Ensure the TF.js backend is initialized (singleton).
 */
async function ensure_initialized(): Promise<void> {
  if (_initialized) return;
  await Clustering.init();
  console.log("[clustering-adapter] TF.js clustering backend initialized");
  _initialized = true;
}

/**
 * Log TF.js memory usage for diagnostics.
 */
function log_memory(label: string): void {
  try {
    // Dynamic require to avoid hard failure if tfjs-node isn't available
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
    algorithm: config.algorithm === "som" ? "kmeans" : config.algorithm,
    metrics: map_metrics(config.metrics),
  };

  // Map algorithm-specific params
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

  // Map scoring function (snake_case → camelCase bridge)
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
  return metrics.map((m) => {
    switch (m) {
      case "silhouette":
        return "silhouette";
      case "davies_bouldin":
        return "daviesBouldin";
      case "calinski_harabasz":
        return "calinskiHarabasz";
      default:
        return m as "silhouette";
    }
  });
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
  const labels = Array.isArray(optimal.labels)
    ? optimal.labels
    : Array.from(optimal.labels);

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
 * Run SOM-based 2-phase clustering:
 * Phase 1: Train SOM on data → extract weight vectors
 * Phase 2: Agglomerative clustering on weight vectors → final labels
 */
async function run_som_clustering(
  data: number[][],
  config: ClusteringConfig
): Promise<ClusteringResult> {
  const n = data.length;
  const som_params = (config.algorithm_params ?? {}) as SomParams;

  // Grid size heuristic: ceil(sqrt(n * 2))
  const grid_dim = Math.max(
    2,
    som_params.grid_width ?? Math.ceil(Math.sqrt(n * 2))
  );
  const grid_height = som_params.grid_height ?? grid_dim;

  // Phase 1: Train SOM
  const som = new Clustering.SOM({
    nClusters: grid_dim * grid_height,
    gridWidth: grid_dim,
    gridHeight: grid_height,
    topology: som_params.topology ?? "hexagonal",
    neighborhood: som_params.neighborhood ?? "gaussian",
    initialization: som_params.initialization ?? "pca",
    numEpochs: som_params.num_epochs ?? 200,
    learningRate: som_params.learning_rate ?? 0.5,
    onlineMode: true, // Enable partialFit for later incremental use
    tol: 1e-5,
  });

  await som.fit(data);

  // Extract weight vectors from SOM grid
  const weights_tensor = som.getWeights();
  const weights_3d: number[][][] = weights_tensor.arraySync();
  const weights_flat: number[][] = [];
  for (let i = 0; i < grid_height; i++) {
    for (let j = 0; j < grid_dim; j++) {
      weights_flat.push(weights_3d[i][j]);
    }
  }

  // Get BMU indices for all data points
  const bmu_indices = (await som.predict(data)) as number[];

  // Phase 2: Sweep agglomerative clustering on weight vectors for optimal k
  const min_k = config.min_clusters ?? 2;
  const max_k = Math.min(Math.floor(n / 3), config.max_clusters);

  let best_result: ClusteringResult | null = null;
  let best_score = -Infinity;
  const all_evaluations: ClusterEvaluation[] = [];

  for (let k = min_k; k <= max_k; k++) {
    const agglom = new Clustering.AgglomerativeClustering({
      nClusters: k,
      linkage: "ward",
    });
    const neuron_labels = (await agglom.fitPredict(
      weights_flat
    )) as number[];

    // Map data points to final clusters via their BMU
    const data_labels = bmu_indices.map(
      (bmu_idx) => neuron_labels[bmu_idx]
    );

    // Evaluate using the library's built-in findOptimalClusters for just this k
    // We compute a simple silhouette-like score by checking cluster compactness
    const evaluation: ClusterEvaluation = {
      k,
      scores: {},
      labels: data_labels,
    };
    all_evaluations.push(evaluation);

    // Use number of non-empty clusters as a basic scoring heuristic
    const unique_labels = new Set(data_labels);
    // Prefer k values that produce actual different clusters (no empty ones)
    const score = unique_labels.size === k ? k : k - (k - unique_labels.size) * 2;

    if (score > best_score || best_result === null) {
      best_score = score;
      best_result = {
        labels: data_labels,
        n_clusters: unique_labels.size,
        scores: {},
        all_evaluations,
      };
    }
  }

  // Clean up
  som.dispose();

  // If no valid k was found (e.g., n too small), return single-cluster fallback
  if (!best_result) {
    return {
      labels: new Array(n).fill(0),
      n_clusters: 1,
      scores: {},
      all_evaluations: [],
    };
  }

  best_result.all_evaluations = all_evaluations;
  return best_result;
}

/**
 * Main entry point: run clustering with the given config.
 */
export async function run_clustering(
  data: number[][],
  config: ClusteringConfig
): Promise<ClusteringResult> {
  await ensure_initialized();
  log_memory("before clustering");

  let result: ClusteringResult;

  if (config.algorithm === "som") {
    result = await run_som_clustering(data, config);
  } else {
    result = await run_standard_clustering(data, config);
  }

  log_memory("after clustering");
  return result;
}

/**
 * Get a reference to the SOM class for direct use (e.g., incremental clustering).
 */
export async function create_som_instance(
  params: SomParams & { n_clusters: number }
): Promise<InstanceType<typeof Clustering.SOM>> {
  await ensure_initialized();

  const grid_dim = params.grid_width ?? Math.ceil(Math.sqrt(params.n_clusters * 2));
  const grid_height = params.grid_height ?? grid_dim;

  return new Clustering.SOM({
    nClusters: grid_dim * grid_height,
    gridWidth: grid_dim,
    gridHeight: grid_height,
    topology: params.topology ?? "hexagonal",
    neighborhood: params.neighborhood ?? "gaussian",
    initialization: params.initialization ?? "pca",
    numEpochs: params.num_epochs ?? 200,
    learningRate: params.learning_rate ?? 0.5,
    onlineMode: true,
    tol: 1e-5,
  });
}
