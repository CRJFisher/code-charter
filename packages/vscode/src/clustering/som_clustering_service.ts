/**
 * SOM-based clustering service with incremental re-clustering support.
 * Maintains a persistent SOM instance that updates via partialFit()
 * when code changes, and persists state to disk for instant clustering
 * on project reopen.
 *
 * DESIGN NOTE: The SOM trains on raw embedding vectors (fixed-dimension 384/1536),
 * NOT on the NxN combined similarity+adjacency matrix. This is required because
 * the NxN matrix changes dimension when functions are added/removed, which is
 * incompatible with incremental learning via partialFit(). Secondary agglomerative
 * grouping on SOM weight vectors produces the final cluster assignments.
 */

import * as crypto from "crypto";
import * as vscode from "vscode";
import { OpenAI } from "openai";
import { Clustering } from "clustering-tfjs";
import { LocalEmbeddingsProvider, EmbeddingProvider } from "./local_embeddings_provider";
import { EmbeddingProviderSelector, EmbeddingProviderType } from "./embedding_provider_selector";
import { CallGraphNode } from "@ariadnejs/types";
import type { NodeGroup } from "@code-charter/types";
import {
  group_clusters_by_label,
  order_clusters_by_centroid,
  prepare_data,
} from "./clustering_logic";

const EMBEDDING_DIMENSIONS: Record<EmbeddingProviderType, number> = {
  local: 384,
  openai: 1536,
};

interface SomStateMetadata {
  version: number;
  provider_type: EmbeddingProviderType;
  embedding_dimensions: number;
  function_count: number;
  timestamp: string;
  grid_width: number;
  grid_height: number;
}

interface SomStateFile {
  metadata: SomStateMetadata;
  som_json: string;
  embeddings_cache: Record<string, number[]>;
  symbol_hashes: Record<string, string>;
}

interface CallGraphDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

export class SomClusteringService {
  private som: InstanceType<typeof Clustering.SOM> | null = null;
  private embeddings_cache: Record<string, number[]> = {};
  private symbol_hashes: Record<string, string> = {};
  private embedding_provider: EmbeddingProvider | null = null;
  private provider_type: EmbeddingProviderType | null = null;
  private previous_call_graph_items: Record<string, CallGraphNode> | null = null;
  private current_node_groups: NodeGroup[] = [];
  private is_initialized = false;
  private clustering_in_progress = false;

  constructor(
    private api_key: string | null,
    private work_dir: vscode.Uri,
    private context: vscode.ExtensionContext
  ) {}

  private async initialize_embedding_provider(): Promise<void> {
    if (this.embedding_provider) return;

    this.provider_type = await EmbeddingProviderSelector.get_embedding_provider(this.context);
    const is_valid = await EmbeddingProviderSelector.validate_provider_config(this.provider_type);
    if (!is_valid) {
      throw new Error("Invalid embedding provider configuration");
    }

    if (this.provider_type === "local") {
      this.embedding_provider = new LocalEmbeddingsProvider(this.context, () => {});
    } else {
      if (!this.api_key) {
        throw new Error("OpenAI client not initialized. API key required.");
      }
      const client = new OpenAI({ apiKey: this.api_key });
      this.embedding_provider = {
        getEmbeddings: async (texts: string[]) => {
          const response = await client.embeddings.create({
            input: texts,
            model: "text-embedding-ada-002",
          });
          return response.data.map((item) => item.embedding);
        },
      };
    }
  }

  /**
   * Run secondary agglomerative grouping on SOM weight vectors.
   * This merges raw SOM neuron labels into a smaller number of meaningful clusters.
   */
  private async agglomerative_grouping(
    bmu_indices: number[],
    n: number,
    index_to_func: Record<number, string>
  ): Promise<string[][]> {
    const grid_dim = this.som!.params.gridWidth;
    const grid_height = this.som!.params.gridHeight;

    // Extract and flatten weight vectors
    const weights_tensor = this.som!.getWeights();
    const weights_3d: number[][][] = weights_tensor.arraySync();
    if (weights_tensor.dispose) weights_tensor.dispose();

    const weights_flat: number[][] = [];
    for (let i = 0; i < grid_height; i++) {
      for (let j = 0; j < grid_dim; j++) {
        weights_flat.push(weights_3d[i][j]);
      }
    }

    // Agglomerative clustering on weight vectors
    const target_k = Math.min(Math.max(2, Math.floor(n / 3)), 12);
    const agglom = new Clustering.AgglomerativeClustering({
      nClusters: target_k,
      linkage: "ward",
    });
    const neuron_labels = (await agglom.fitPredict(weights_flat)) as number[];

    // Map data points to final clusters via their BMU's neuron label
    const final_labels = bmu_indices.map((bmu_idx) => neuron_labels[bmu_idx]);

    const grouped = group_clusters_by_label(final_labels, index_to_func);
    return order_clusters_by_centroid(grouped, this.embeddings_cache);
  }

  /**
   * Full initial clustering with SOM.
   * Trains on raw embedding vectors (fixed dimension) for incremental compatibility.
   */
  async full_cluster(
    refined_function_summaries: Record<string, string>,
    call_graph_items: Record<string, CallGraphNode>
  ): Promise<NodeGroup[]> {
    if (this.clustering_in_progress) {
      return this.current_node_groups;
    }
    this.clustering_in_progress = true;

    try {
      await this.initialize_embedding_provider();
      await Clustering.init();

      const symbols = Object.keys(refined_function_summaries);
      const { func_to_index, index_to_func, n } = prepare_data(refined_function_summaries);

      // Try loading saved SOM state first
      const loaded = await this.load_som_state();
      if (loaded && this.som) {
        // Ensure all symbols have embeddings
        const missing_symbols = symbols.filter((s) => !this.embeddings_cache[s]);
        if (missing_symbols.length > 0) {
          const new_embeddings = await this.embed_symbols(missing_symbols, refined_function_summaries);
          Object.assign(this.embeddings_cache, new_embeddings);
        }
        // Prune stale symbols from cache
        for (const key of Object.keys(this.embeddings_cache)) {
          if (!refined_function_summaries[key]) delete this.embeddings_cache[key];
        }

        // Predict using raw embeddings (same feature space as training)
        const embedding_matrix = this.build_ordered_embedding_matrix(symbols, func_to_index, n);
        const bmu_indices = (await this.som.predict(embedding_matrix)) as number[];

        // Secondary agglomerative grouping (was missing in load path)
        const ordered = await this.agglomerative_grouping(bmu_indices, n, index_to_func);

        this.current_node_groups = ordered.map((members, i) => ({
          description: "",
          memberSymbols: members,
          metadata: { algorithm_used: "som" as const, cluster_index: i },
        }));
        this.previous_call_graph_items = call_graph_items;
        this.hash_all_nodes(call_graph_items);
        this.is_initialized = true;
        return this.current_node_groups;
      }

      // Full training path: embed all symbols
      const embeddings = await this.embed_symbols(symbols, refined_function_summaries);
      this.embeddings_cache = embeddings;

      // Build ordered embedding matrix for SOM training (raw embeddings, fixed dimension)
      const embedding_matrix = this.build_ordered_embedding_matrix(symbols, func_to_index, n);

      // Determine grid size
      const grid_dim = Math.max(2, Math.ceil(Math.sqrt(n * 2)));

      // Create and train SOM on raw embeddings
      this.som = new Clustering.SOM({
        nClusters: grid_dim * grid_dim,
        gridWidth: grid_dim,
        gridHeight: grid_dim,
        topology: "hexagonal",
        neighborhood: "gaussian",
        initialization: "pca",
        numEpochs: 200,
        learningRate: 0.5,
        onlineMode: true,
        tol: 1e-5,
      });

      await this.som.fit(embedding_matrix);

      // Get BMU indices
      const bmu_indices = (await this.som.predict(embedding_matrix)) as number[];

      // Secondary agglomerative grouping on SOM weight vectors
      const ordered = await this.agglomerative_grouping(bmu_indices, n, index_to_func);

      this.current_node_groups = ordered.map((members, i) => ({
        description: "",
        memberSymbols: members,
        metadata: { algorithm_used: "som" as const, cluster_index: i },
      }));

      this.previous_call_graph_items = call_graph_items;
      this.hash_all_nodes(call_graph_items);
      this.is_initialized = true;

      await this.save_som_state();
      return this.current_node_groups;
    } finally {
      this.clustering_in_progress = false;
    }
  }

  /**
   * Incremental re-clustering triggered by call graph changes.
   * Uses partialFit on raw embeddings, then secondary agglomerative grouping.
   */
  async incremental_recluster(
    new_call_graph_items: Record<string, CallGraphNode>,
    refined_function_summaries: Record<string, string>
  ): Promise<NodeGroup[] | null> {
    if (!this.is_initialized || !this.som || this.clustering_in_progress) {
      return null;
    }
    if (!this.previous_call_graph_items) {
      return null;
    }

    this.clustering_in_progress = true;

    try {
      const diff = this.diff_call_graphs(this.previous_call_graph_items, new_call_graph_items);

      if (diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0) {
        return null;
      }

      console.log(
        `[SomClusteringService] Incremental update: +${diff.added.length} -${diff.removed.length} ~${diff.changed.length}`
      );

      // Re-embed changed/added symbols
      const symbols_to_embed = [...diff.added, ...diff.changed].filter(
        (s) => refined_function_summaries[s]
      );

      if (symbols_to_embed.length > 0) {
        const new_embeddings = await this.embed_symbols(symbols_to_embed, refined_function_summaries);
        Object.assign(this.embeddings_cache, new_embeddings);
      }

      // Remove deleted symbols from cache
      for (const symbol of diff.removed) {
        delete this.embeddings_cache[symbol];
      }

      // Partial fit with changed raw embeddings (same feature space as SOM training)
      if (symbols_to_embed.length > 0) {
        const changed_embeddings = symbols_to_embed
          .filter((s) => this.embeddings_cache[s])
          .map((s) => this.embeddings_cache[s]);

        if (changed_embeddings.length > 0) {
          await this.som.partialFit(changed_embeddings);
        }
      }

      // Re-predict on all current raw embeddings
      const current_symbols = Object.keys(refined_function_summaries).filter(
        (s) => this.embeddings_cache[s]
      );
      const { func_to_index, index_to_func, n } = prepare_data(
        Object.fromEntries(current_symbols.map((s) => [s, refined_function_summaries[s]]))
      );

      const all_embeddings = this.build_ordered_embedding_matrix(current_symbols, func_to_index, n);
      const bmu_indices = (await this.som.predict(all_embeddings)) as number[];

      // Secondary agglomerative grouping (was missing in incremental path)
      const ordered = await this.agglomerative_grouping(bmu_indices, n, index_to_func);

      this.current_node_groups = ordered.map((members, i) => ({
        description: "",
        memberSymbols: members,
        metadata: { algorithm_used: "som" as const, cluster_index: i },
      }));

      this.previous_call_graph_items = new_call_graph_items;
      this.hash_all_nodes(new_call_graph_items);

      await this.save_som_state();
      return this.current_node_groups;
    } finally {
      this.clustering_in_progress = false;
    }
  }

  private diff_call_graphs(
    old_items: Record<string, CallGraphNode>,
    new_items: Record<string, CallGraphNode>
  ): CallGraphDiff {
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];

    for (const symbol of Object.keys(new_items)) {
      if (!old_items[symbol]) {
        added.push(symbol);
      } else {
        const new_hash = this.hash_callable_node(new_items[symbol]);
        const old_hash = this.symbol_hashes[symbol];
        if (new_hash !== old_hash) {
          changed.push(symbol);
        }
      }
    }

    for (const symbol of Object.keys(old_items)) {
      if (!new_items[symbol]) {
        removed.push(symbol);
      }
    }

    return { added, removed, changed };
  }

  private hash_callable_node(node: CallGraphNode): string {
    const calls_signature = node.calls
      .map((call) => call.symbol)
      .sort()
      .join(",");
    return crypto.createHash("md5").update(calls_signature).digest("hex").substring(0, 8);
  }

  private hash_all_nodes(call_graph_items: Record<string, CallGraphNode>): void {
    this.symbol_hashes = {};
    for (const [symbol, node] of Object.entries(call_graph_items)) {
      this.symbol_hashes[symbol] = this.hash_callable_node(node);
    }
  }

  private async embed_symbols(
    symbols: string[],
    summaries: Record<string, string>
  ): Promise<Record<string, number[]>> {
    if (!this.embedding_provider) {
      throw new Error("Embedding provider not initialized");
    }

    const valid_symbols = symbols.filter((s) => summaries[s]);
    const texts = valid_symbols.map((s) => summaries[s]);
    if (texts.length === 0) return {};

    const embeddings = await this.embedding_provider.getEmbeddings(texts);

    const result: Record<string, number[]> = {};
    embeddings.forEach((embedding, index) => {
      result[valid_symbols[index]] = embedding;
    });

    return result;
  }

  /**
   * Build an ordered embedding matrix where row i corresponds to func_to_index position i.
   */
  private build_ordered_embedding_matrix(
    symbols: string[],
    func_to_index: Record<string, number>,
    n: number
  ): number[][] {
    const dim = this.embeddings_cache[symbols[0]]?.length ?? 384;
    const matrix: number[][] = new Array(n).fill(null).map(() => new Array(dim).fill(0));
    for (const symbol of symbols) {
      const idx = func_to_index[symbol];
      if (idx !== undefined && this.embeddings_cache[symbol]) {
        matrix[idx] = this.embeddings_cache[symbol];
      }
    }
    return matrix;
  }

  private async save_som_state(): Promise<void> {
    if (!this.som || !this.provider_type) return;

    try {
      const som_json = await this.som.saveToJSON();
      const state_file: SomStateFile = {
        metadata: {
          version: 1,
          provider_type: this.provider_type,
          embedding_dimensions: EMBEDDING_DIMENSIONS[this.provider_type],
          function_count: Object.keys(this.embeddings_cache).length,
          timestamp: new Date().toISOString(),
          grid_width: this.som.params.gridWidth,
          grid_height: this.som.params.gridHeight,
        },
        som_json,
        embeddings_cache: this.embeddings_cache,
        symbol_hashes: this.symbol_hashes,
      };

      const state_dir = vscode.Uri.joinPath(this.work_dir, "som_state");
      try {
        await vscode.workspace.fs.createDirectory(state_dir);
      } catch {
        // May already exist
      }

      const state_path = vscode.Uri.joinPath(state_dir, `${this.provider_type}.json`);
      await vscode.workspace.fs.writeFile(
        state_path,
        new TextEncoder().encode(JSON.stringify(state_file))
      );
      console.log(`[SomClusteringService] Saved SOM state to ${state_path.fsPath}`);
    } catch (err) {
      console.warn("[SomClusteringService] Failed to save SOM state:", err);
    }
  }

  private async load_som_state(): Promise<boolean> {
    if (!this.provider_type) return false;

    try {
      const state_path = vscode.Uri.joinPath(
        this.work_dir,
        "som_state",
        `${this.provider_type}.json`
      );
      const data = await vscode.workspace.fs.readFile(state_path);
      const state_file: SomStateFile = JSON.parse(new TextDecoder().decode(data));

      if (state_file.metadata.version !== 1) {
        console.warn("[SomClusteringService] Unsupported state version");
        return false;
      }
      if (state_file.metadata.provider_type !== this.provider_type) {
        console.warn("[SomClusteringService] Provider type mismatch");
        return false;
      }
      const expected_dims = EMBEDDING_DIMENSIONS[this.provider_type];
      if (state_file.metadata.embedding_dimensions !== expected_dims) {
        console.warn("[SomClusteringService] Embedding dimension mismatch");
        return false;
      }

      await Clustering.init();
      this.som = new Clustering.SOM({
        nClusters: state_file.metadata.grid_width * state_file.metadata.grid_height,
        gridWidth: state_file.metadata.grid_width,
        gridHeight: state_file.metadata.grid_height,
        topology: "hexagonal",
        neighborhood: "gaussian",
        initialization: "pca",
        onlineMode: true,
      });
      await this.som.loadFromJSON(state_file.som_json);

      this.embeddings_cache = state_file.embeddings_cache;
      this.symbol_hashes = state_file.symbol_hashes;

      console.log(
        `[SomClusteringService] Loaded SOM state (${state_file.metadata.function_count} functions)`
      );
      return true;
    } catch {
      return false;
    }
  }

  get_current_groups(): NodeGroup[] {
    return this.current_node_groups;
  }

  is_som_ready(): boolean {
    return this.is_initialized && this.som !== null;
  }

  dispose(): void {
    if (this.som) {
      this.som.dispose();
      this.som = null;
    }
    this.embedding_provider = null;
    this.embeddings_cache = {};
    this.symbol_hashes = {};
    this.current_node_groups = [];
    this.is_initialized = false;
  }
}
