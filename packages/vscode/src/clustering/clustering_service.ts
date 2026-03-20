import { CallGraphNode } from "@ariadnejs/types";
import { findOptimalClusters } from "clustering-tfjs";
import * as crypto from "crypto";
import { CacheStorage, ClusteringConfig, EmbeddingProvider } from "./clustering_types";

export class ClusteringService {
  private embedding_provider: EmbeddingProvider;
  private cache_storage: CacheStorage;
  private progress_reporter?: (message: string) => void;

  constructor(config: ClusteringConfig) {
    this.embedding_provider = config.embedding_provider;
    this.cache_storage = config.cache_storage;
    this.progress_reporter = config.progress_reporter;
  }

  async cluster(
    descriptions: Record<string, string>,
    call_graph_items: Record<string, CallGraphNode>
  ): Promise<string[][]> {
    const summaries_hash = this.hash_summaries(descriptions);

    const cached_clusters = await this.cache_storage.read_json<string[][]>(
      `clusters/${summaries_hash}.json`
    );
    if (cached_clusters) {
      return cached_clusters;
    }

    this.progress_reporter?.("Generating embeddings...");
    const embeddings = await this.get_embeddings(descriptions, summaries_hash);

    const { func_to_index, index_to_func, n } = this.prepare_data(descriptions);

    const similarity_matrix = this.create_similarity_matrix(embeddings, func_to_index, n);

    const combined_matrix = this.create_combined_matrix(
      call_graph_items,
      func_to_index,
      similarity_matrix,
      n
    );

    const result = await findOptimalClusters(combined_matrix, {
      maxClusters: Math.min(Math.floor(n / 3), 12),
      algorithm: "spectral",
      algorithmParams: { affinity: "nearest_neighbors" },
      metrics: ["silhouette", "calinskiHarabasz"],
      scoringFunction: (evaluation) => {
        const silhouette = evaluation.silhouette || 0;
        const calinski_harabasz = evaluation.calinskiHarabasz || 0;
        return silhouette * 2 + calinski_harabasz;
      },
    });

    const grouped_clusters = this.group_clusters_by_label(result.labels, index_to_func);
    const ordered_clusters = this.order_clusters_by_centroid(
      grouped_clusters,
      embeddings,
      func_to_index
    );

    await this.cache_storage.write_json(`clusters/${summaries_hash}.json`, ordered_clusters);

    return ordered_clusters;
  }

  private async embed_summaries(summaries: Record<string, string>): Promise<Record<string, number[]>> {
    const summary_texts = Object.values(summaries);
    const summary_keys = Object.keys(summaries);

    const embeddings = await this.embedding_provider.getEmbeddings(summary_texts);

    const result: Record<string, number[]> = {};
    embeddings.forEach((embedding, index) => {
      result[summary_keys[index]] = embedding;
    });

    return result;
  }

  private hash_summaries(summaries: Record<string, string>): string {
    const hash = crypto.createHash("md5");
    hash.update(JSON.stringify(summaries));
    return hash.digest("hex").substring(0, 8);
  }

  private async get_embeddings(
    summaries: Record<string, string>,
    summaries_hash: string
  ): Promise<Record<string, number[]>> {
    const sub_path = `embeddings/${summaries_hash}.json`;

    const cached = await this.cache_storage.read_json<Record<string, number[]>>(sub_path);
    if (cached) {
      return cached;
    }

    const embeddings = await this.embed_summaries(summaries);
    await this.cache_storage.write_json(sub_path, embeddings);
    return embeddings;
  }

  private prepare_data(summaries: Record<string, string>) {
    const func_names = Object.keys(summaries);
    const func_to_index: Record<string, number> = {};
    const index_to_func: Record<number, string> = {};

    func_names.forEach((name, index) => {
      func_to_index[name] = index;
      index_to_func[index] = name;
    });

    return { func_to_index, index_to_func, n: func_names.length };
  }

  private create_similarity_matrix(
    embeddings: Record<string, number[]>,
    func_to_index: Record<string, number>,
    n: number
  ): number[][] {
    const matrix: number[][] = Array(n)
      .fill(null)
      .map(() => Array(n).fill(0));
    const func_names = Object.keys(func_to_index);

    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 1.0;
        } else {
          const similarity = this.cosine_similarity(
            embeddings[func_names[i]],
            embeddings[func_names[j]]
          );
          matrix[i][j] = similarity;
          matrix[j][i] = similarity;
        }
      }
    }

    return matrix;
  }

  private cosine_similarity(a: number[], b: number[]): number {
    let dot_product = 0;
    let norm_a = 0;
    let norm_b = 0;

    for (let i = 0; i < a.length; i++) {
      dot_product += a[i] * b[i];
      norm_a += a[i] * a[i];
      norm_b += b[i] * b[i];
    }

    return dot_product / (Math.sqrt(norm_a) * Math.sqrt(norm_b));
  }

  private create_combined_matrix(
    call_graph_items: Record<string, CallGraphNode>,
    func_to_index: Record<string, number>,
    similarity_matrix: number[][],
    n: number
  ): number[][] {
    const adjacency_matrix: number[][] = Array(n)
      .fill(null)
      .map(() => Array(n).fill(0));

    Object.entries(call_graph_items).forEach(([symbol, node]) => {
      const i = func_to_index[symbol];
      if (i === undefined) return;

      node.calls.forEach((call) => {
        const j = func_to_index[call.symbol];
        if (j !== undefined && i !== j) {
          adjacency_matrix[i][j] = 1;
          adjacency_matrix[j][i] = 1;
        }
      });
    });

    const combined_matrix: number[][] = Array(n)
      .fill(null)
      .map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        combined_matrix[i][j] =
          0.5 * similarity_matrix[i][j] + 0.5 * adjacency_matrix[i][j];
      }
    }

    return combined_matrix;
  }

  private group_clusters_by_label(
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

  private order_clusters_by_centroid(
    clusters: string[][],
    embeddings: Record<string, number[]>,
    func_to_index: Record<string, number>
  ): string[][] {
    const cluster_distances: Array<{ cluster: string[]; distance: number }> = [];

    clusters.forEach((cluster) => {
      const centroid = this.calculate_centroid(cluster, embeddings);
      let total_distance = 0;
      cluster.forEach((func) => {
        total_distance += this.euclidean_distance(embeddings[func], centroid);
      });

      cluster_distances.push({
        cluster,
        distance: total_distance / cluster.length,
      });
    });

    cluster_distances.sort((a, b) => a.distance - b.distance);
    return cluster_distances.map((item) => item.cluster);
  }

  private calculate_centroid(
    cluster: string[],
    embeddings: Record<string, number[]>
  ): number[] {
    const dimension = embeddings[cluster[0]].length;
    const centroid = Array(dimension).fill(0);

    cluster.forEach((func) => {
      const embedding = embeddings[func];
      for (let i = 0; i < dimension; i++) {
        centroid[i] += embedding[i];
      }
    });

    for (let i = 0; i < dimension; i++) {
      centroid[i] /= cluster.length;
    }

    return centroid;
  }

  private euclidean_distance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
  }
}
