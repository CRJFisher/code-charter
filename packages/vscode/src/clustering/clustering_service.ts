import { CallGraphNode } from "@ariadnejs/types";
import * as crypto from "crypto";
import * as vscode from "vscode";
import { OpenAI } from "openai";
import { LocalEmbeddingsProvider, EmbeddingProvider } from "./local_embeddings_provider";
import { EmbeddingProviderSelector, EmbeddingProviderType } from "./embedding_provider_selector";
import { run_clustering } from "./clustering_adapter";
import {
  prepare_data,
  create_similarity_matrix,
  create_adjacency_matrix,
  create_combined_matrix,
  group_clusters_by_label,
  order_clusters_by_centroid,
} from "./clustering_logic";
import type {
  ClusteringAlgorithm,
  ClusteringConfig,
  ClusteringResult as AdapterResult,
} from "@code-charter/types";

/**
 * Result returned by ClusteringService.cluster().
 */
export interface ClusterResult {
  clusters: string[][];
  algorithm_used: ClusteringAlgorithm;
  quality_score?: number;
}

/**
 * Read clustering configuration from VS Code settings.
 */
export function read_clustering_config(): {
  algorithm: ClusteringAlgorithm;
  max_clusters: number;
} {
  const configuration = vscode.workspace.getConfiguration("code-charter-vscode");
  const algorithm =
    (configuration.get<string>("clusteringAlgorithm") as ClusteringAlgorithm) ?? "spectral";
  const max_clusters = configuration.get<number>("clusteringMaxClusters") ?? 12;
  return { algorithm, max_clusters };
}

export class ClusteringService {
  private openai_client: OpenAI | null;
  private work_dir: vscode.Uri;
  private embedding_provider: EmbeddingProvider | null = null;
  private provider_type: EmbeddingProviderType | null = null;
  private algorithm: ClusteringAlgorithm;
  private max_clusters: number;

  constructor(
    private api_key: string | null,
    work_dir: vscode.Uri,
    private context: vscode.ExtensionContext,
    config?: { algorithm: ClusteringAlgorithm; max_clusters: number }
  ) {
    this.openai_client = api_key ? new OpenAI({ apiKey: api_key }) : null;
    this.work_dir = work_dir;
    this.algorithm = config?.algorithm ?? "spectral";
    this.max_clusters = config?.max_clusters ?? 12;
  }

  /**
   * Initialize the embedding provider based on user preference.
   */
  private async initialize_embedding_provider(): Promise<void> {
    if (this.embedding_provider) return;

    this.provider_type = await EmbeddingProviderSelector.get_embedding_provider(this.context);

    const is_valid = await EmbeddingProviderSelector.validate_provider_config(this.provider_type);
    if (!is_valid) {
      throw new Error("Invalid embedding provider configuration");
    }

    if (this.provider_type === "local") {
      this.embedding_provider = new LocalEmbeddingsProvider(
        this.context,
        (message: string, progress?: number) => {
          vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Code Charter: Embeddings",
              cancellable: false,
            },
            async (progress_reporter) => {
              progress_reporter.report({ message, increment: progress });
              await new Promise((resolve) =>
                setTimeout(resolve, progress === 100 ? 1000 : 100)
              );
            }
          );
        }
      );
    } else {
      if (!this.openai_client) {
        throw new Error("OpenAI client not initialized. API key required.");
      }

      this.embedding_provider = {
        getEmbeddings: async (texts: string[]) => {
          const response = await this.openai_client!.embeddings.create({
            input: texts,
            model: "text-embedding-ada-002",
          });
          return response.data.map((item) => item.embedding);
        },
      };
    }
  }

  /**
   * Main clustering function.
   */
  async cluster(
    refined_function_summaries: Record<string, string>,
    call_graph_items: Record<string, CallGraphNode>
  ): Promise<ClusterResult> {
    await this.initialize_embedding_provider();

    // Generate hashes for caching
    const embeddings_hash = this.hash_embeddings(
      refined_function_summaries,
      this.provider_type!
    );
    const cluster_hash = this.hash_clusters(
      refined_function_summaries,
      this.provider_type!,
      call_graph_items
    );

    // Try to load cached clusters
    const cached_clusters = await this.load_cached_clusters(cluster_hash);
    if (cached_clusters) {
      return {
        clusters: cached_clusters,
        algorithm_used: this.algorithm,
      };
    }

    // Generate or load embeddings
    const embeddings = await this.get_embeddings(refined_function_summaries, embeddings_hash);

    // Prepare data structures
    const { func_to_index, index_to_func, n } = prepare_data(refined_function_summaries);

    // Create similarity matrix from embeddings
    const similarity_matrix = create_similarity_matrix(embeddings, func_to_index, n);

    // Create adjacency matrix from call graph
    const adjacency_matrix = create_adjacency_matrix(call_graph_items, func_to_index, n);

    // Create combined matrix with L1 normalization and 50/50 weighting
    const combined_matrix = create_combined_matrix(similarity_matrix, adjacency_matrix);

    // Run clustering via the adapter
    const effective_max_clusters = Math.min(Math.floor(n / 3), this.max_clusters);
    const clustering_config: ClusteringConfig = {
      algorithm: this.algorithm,
      min_clusters: 2,
      max_clusters: Math.max(2, effective_max_clusters),
      algorithm_params:
        this.algorithm === "spectral"
          ? { affinity: "nearest_neighbors" }
          : undefined,
      metrics: ["silhouette", "calinski_harabasz"],
      scoring_function: (scores) => {
        const silhouette = scores.silhouette ?? 0;
        const calinski_harabasz = scores.calinski_harabasz ?? 0;
        return silhouette * 2 + calinski_harabasz;
      },
    };

    const result = await run_clustering(combined_matrix, clustering_config);

    // Convert cluster labels to grouped function names
    const grouped_clusters = group_clusters_by_label(result.labels, index_to_func);

    // Order clusters by average distance to centroid
    const ordered_clusters = order_clusters_by_centroid(grouped_clusters, embeddings);

    // Cache the results
    await this.save_clusters(ordered_clusters, cluster_hash);

    return {
      clusters: ordered_clusters,
      algorithm_used: this.algorithm,
      quality_score: result.scores.silhouette,
    };
  }

  /**
   * Generate embeddings for function summaries using configured provider.
   */
  private async embed_summaries(
    summaries: Record<string, string>
  ): Promise<Record<string, number[]>> {
    if (!this.embedding_provider) {
      throw new Error("Embedding provider not initialized");
    }

    const summary_texts = Object.values(summaries);
    const summary_keys = Object.keys(summaries);

    const embeddings = await this.embedding_provider.getEmbeddings(summary_texts);

    const result: Record<string, number[]> = {};
    embeddings.forEach((embedding, index) => {
      result[summary_keys[index]] = embedding;
    });

    return result;
  }

  /**
   * Hash summaries + provider for embeddings cache key.
   */
  private hash_embeddings(summaries: Record<string, string>, provider: string): string {
    const hash = crypto.createHash("md5");
    hash.update(JSON.stringify({ summaries, provider }));
    return hash.digest("hex").substring(0, 8);
  }

  /**
   * Hash summaries + provider + call graph structure for cluster cache key.
   */
  private hash_clusters(
    summaries: Record<string, string>,
    provider: string,
    call_graph_items: Record<string, CallGraphNode>
  ): string {
    // Build deterministic representation of call graph edges
    const edges: string[] = [];
    for (const [symbol, node] of Object.entries(call_graph_items).sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      const sorted_calls = node.calls.map((c) => c.symbol).sort();
      for (const target of sorted_calls) {
        edges.push(`${symbol}->${target}`);
      }
    }

    const hash = crypto.createHash("md5");
    hash.update(
      JSON.stringify({
        summaries,
        provider,
        edges,
        algorithm: this.algorithm,
        max_clusters: this.max_clusters,
      })
    );
    return hash.digest("hex").substring(0, 8);
  }

  /**
   * Get embeddings from cache or generate new ones.
   */
  private async get_embeddings(
    summaries: Record<string, string>,
    embeddings_hash: string
  ): Promise<Record<string, number[]>> {
    const embeddings_path = vscode.Uri.joinPath(
      this.work_dir,
      "embeddings",
      `${embeddings_hash}.json`
    );

    // Try to load cached embeddings
    try {
      const cached = await vscode.workspace.fs.readFile(embeddings_path);
      const cached_data = JSON.parse(cached.toString()) as Record<string, number[]>;
      console.log(`Loaded cached embeddings from ${embeddings_path.fsPath}`);
      return cached_data;
    } catch {
      console.log("No cached embeddings found, generating new ones...");
    }

    // Generate new embeddings
    const embeddings = await this.embed_summaries(summaries);

    // Cache the embeddings
    await this.ensure_directory(vscode.Uri.joinPath(this.work_dir, "embeddings"));
    await vscode.workspace.fs.writeFile(
      embeddings_path,
      new TextEncoder().encode(JSON.stringify(embeddings))
    );
    console.log(`Saved embeddings to ${embeddings_path.fsPath}`);

    return embeddings;
  }

  private async load_cached_clusters(cluster_hash: string): Promise<string[][] | null> {
    const clusters_path = vscode.Uri.joinPath(
      this.work_dir,
      "clusters",
      `${cluster_hash}.json`
    );

    try {
      const cached = await vscode.workspace.fs.readFile(clusters_path);
      const clusters = JSON.parse(cached.toString()) as string[][];
      console.log(`Loaded cached clusters from ${clusters_path.fsPath}`);
      return clusters;
    } catch {
      return null;
    }
  }

  private async save_clusters(clusters: string[][], cluster_hash: string): Promise<void> {
    const clusters_path = vscode.Uri.joinPath(
      this.work_dir,
      "clusters",
      `${cluster_hash}.json`
    );

    await this.ensure_directory(vscode.Uri.joinPath(this.work_dir, "clusters"));
    await vscode.workspace.fs.writeFile(
      clusters_path,
      new TextEncoder().encode(JSON.stringify(clusters))
    );
    console.log(`Saved clusters to ${clusters_path.fsPath}`);
  }

  private async ensure_directory(uri: vscode.Uri): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(uri);
    } catch {
      // Directory might already exist
    }
  }
}
