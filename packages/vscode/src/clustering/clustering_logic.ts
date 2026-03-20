/**
 * Pure clustering logic functions extracted from ClusteringService.
 * Zero dependencies on vscode, openai, or clustering-tfjs.
 */

export interface CallGraphItem {
  calls: Array<{ symbol: string }>;
}

/**
 * Cosine similarity between two vectors.
 */
export function cosine_similarity(a: number[], b: number[]): number {
  let dot_product = 0;
  let norm_a = 0;
  let norm_b = 0;

  for (let i = 0; i < a.length; i++) {
    dot_product += a[i] * b[i];
    norm_a += a[i] * a[i];
    norm_b += b[i] * b[i];
  }

  const denom = Math.sqrt(norm_a) * Math.sqrt(norm_b);
  if (denom === 0) return 0;
  return dot_product / denom;
}

/**
 * Euclidean distance between two vectors.
 */
export function euclidean_distance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * Calculate centroid (mean) of a set of embedding vectors.
 */
export function calculate_centroid(
  cluster: string[],
  embeddings: Record<string, number[]>
): number[] {
  const dimension = embeddings[cluster[0]].length;
  const centroid = new Array(dimension).fill(0);

  for (const func of cluster) {
    const embedding = embeddings[func];
    for (let i = 0; i < dimension; i++) {
      centroid[i] += embedding[i];
    }
  }

  for (let i = 0; i < dimension; i++) {
    centroid[i] /= cluster.length;
  }

  return centroid;
}

/**
 * Create similarity matrix from embeddings using batch cosine similarity.
 * Uses normalized dot product: sim(a,b) = (a·b) / (||a|| * ||b||)
 */
export function create_similarity_matrix(
  embeddings: Record<string, number[]>,
  func_to_index: Record<string, number>,
  n: number
): number[][] {
  const func_names = Object.keys(func_to_index);
  const matrix: number[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));

  // Pre-compute norms for efficiency
  const norms: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const vec = embeddings[func_names[i]];
    let norm = 0;
    for (let d = 0; d < vec.length; d++) {
      norm += vec[d] * vec[d];
    }
    norms[i] = Math.sqrt(norm);
  }

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1.0;
    const vec_i = embeddings[func_names[i]];
    for (let j = i + 1; j < n; j++) {
      const vec_j = embeddings[func_names[j]];
      let dot = 0;
      for (let d = 0; d < vec_i.length; d++) {
        dot += vec_i[d] * vec_j[d];
      }
      const denom = norms[i] * norms[j];
      const similarity = denom === 0 ? 0 : dot / denom;
      matrix[i][j] = similarity;
      matrix[j][i] = similarity;
    }
  }

  return matrix;
}

/**
 * Create adjacency matrix from call graph edges (symmetric).
 */
export function create_adjacency_matrix(
  call_graph_items: Record<string, CallGraphItem>,
  func_to_index: Record<string, number>,
  n: number
): number[][] {
  const matrix: number[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));

  for (const [symbol, node] of Object.entries(call_graph_items)) {
    const i = func_to_index[symbol];
    if (i === undefined) continue;

    for (const call of node.calls) {
      const j = func_to_index[call.symbol];
      if (j !== undefined && i !== j) {
        matrix[i][j] = 1;
        matrix[j][i] = 1;
      }
    }
  }

  return matrix;
}

/**
 * L1 row normalization of a matrix.
 * Each row's absolute values sum to 1.0 (or 0 if all-zero row).
 */
export function normalize_matrix(matrix: number[][]): number[][] {
  const n = matrix.length;
  const normalized: number[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    let row_sum = 0;
    for (let j = 0; j < n; j++) {
      row_sum += Math.abs(matrix[i][j]);
    }

    if (row_sum > 0) {
      for (let j = 0; j < n; j++) {
        normalized[i][j] = matrix[i][j] / row_sum;
      }
    }
  }

  return normalized;
}

/**
 * Combine similarity and adjacency matrices with L1 normalization
 * and configurable weighting (default 50/50).
 */
export function create_combined_matrix(
  similarity_matrix: number[][],
  adjacency_matrix: number[][],
  weight: number = 0.5
): number[][] {
  const n = similarity_matrix.length;
  const similarity_normalized = normalize_matrix(similarity_matrix);
  const adjacency_normalized = normalize_matrix(adjacency_matrix);

  const combined: number[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      combined[i][j] =
        weight * similarity_normalized[i][j] +
        (1 - weight) * adjacency_normalized[i][j];
    }
  }

  return combined;
}

/**
 * Group cluster labels into arrays of function names.
 */
export function group_clusters_by_label(
  labels: number[],
  index_to_func: Record<number, string>
): string[][] {
  const clusters: Record<number, string[]> = {};

  labels.forEach((label, index) => {
    if (!clusters[label]) {
      clusters[label] = [];
    }
    clusters[label].push(index_to_func[index]);
  });

  return Object.values(clusters);
}

/**
 * Order clusters by average distance to centroid (ascending).
 * Tighter clusters come first.
 */
export function order_clusters_by_centroid(
  clusters: string[][],
  embeddings: Record<string, number[]>,
): string[][] {
  const cluster_distances: Array<{ cluster: string[]; distance: number }> = [];

  for (const cluster of clusters) {
    const centroid = calculate_centroid(cluster, embeddings);

    let total_distance = 0;
    for (const func of cluster) {
      total_distance += euclidean_distance(embeddings[func], centroid);
    }

    cluster_distances.push({
      cluster,
      distance: total_distance / cluster.length,
    });
  }

  cluster_distances.sort((a, b) => a.distance - b.distance);
  return cluster_distances.map((item) => item.cluster);
}

/**
 * Prepare index mappings for a set of function summaries.
 */
export function prepare_data(summaries: Record<string, string>): {
  func_to_index: Record<string, number>;
  index_to_func: Record<number, string>;
  n: number;
} {
  const func_names = Object.keys(summaries);
  const func_to_index: Record<string, number> = {};
  const index_to_func: Record<number, string> = {};

  func_names.forEach((name, index) => {
    func_to_index[name] = index;
    index_to_func[index] = name;
  });

  return { func_to_index, index_to_func, n: func_names.length };
}
