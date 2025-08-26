import { CallGraphNode } from "@ariadnejs/types";
import { findOptimalClusters } from "clustering-tfjs";
import * as crypto from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import { OpenAI } from "openai";
import { LocalEmbeddingsProvider, EmbeddingProvider } from "./local_embeddings_provider";
import { EmbeddingProviderSelector, EmbeddingProviderType } from "./embedding_provider_selector";

interface EmbeddingCache {
  [key: string]: number[];
}

export class ClusteringService {
  private openAIClient: OpenAI | null;
  private workDir: vscode.Uri;
  private embeddingProvider: EmbeddingProvider | null = null;
  private providerType: EmbeddingProviderType | null = null;

  constructor(
    private apiKey: string | null,
    workDir: vscode.Uri,
    private context: vscode.ExtensionContext
  ) {
    this.openAIClient = apiKey ? new OpenAI({ apiKey }) : null;
    this.workDir = workDir;
  }

  /**
   * Initialize the embedding provider based on user preference
   */
  private async initializeEmbeddingProvider(): Promise<void> {
    if (this.embeddingProvider) {
      return;
    }

    // Get user's provider choice
    this.providerType = await EmbeddingProviderSelector.get_embedding_provider(this.context);
    
    // Validate configuration
    const is_valid = await EmbeddingProviderSelector.validate_provider_config(this.providerType);
    if (!is_valid) {
      throw new Error('Invalid embedding provider configuration');
    }

    if (this.providerType === 'local') {
      // Create local embeddings provider with progress reporting
      this.embeddingProvider = new LocalEmbeddingsProvider(
        this.context,
        (message: string, progress?: number) => {
          // Show progress notification
          vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Code Charter: Embeddings",
            cancellable: false
          }, async (progressReporter) => {
            progressReporter.report({ message, increment: progress });
            // Keep notification open for a moment
            await new Promise(resolve => setTimeout(resolve, progress === 100 ? 1000 : 100));
          });
        }
      );
    } else {
      // Use OpenAI provider
      if (!this.openAIClient) {
        throw new Error('OpenAI client not initialized. API key required.');
      }
      
      this.embeddingProvider = {
        getEmbeddings: async (texts: string[]) => {
          const response = await this.openAIClient!.embeddings.create({
            input: texts,
            model: "text-embedding-ada-002"
          });
          
          return response.data.map(item => item.embedding);
        }
      };
    }
  }

  /**
   * Main clustering function that mimics the Python service behavior
   */
  async cluster(
    refinedFunctionSummaries: Record<string, string>,
    callGraphItems: Record<string, CallGraphNode>
  ): Promise<string[][]> {
    // Initialize embedding provider if needed
    await this.initializeEmbeddingProvider();

    // Generate hash for caching (include provider type in hash)
    const summariesHash = this.hashSummaries(refinedFunctionSummaries, this.providerType!);
    
    // Try to load cached clusters
    const cachedClusters = await this.loadCachedClusters(summariesHash);
    if (cachedClusters) {
      return cachedClusters;
    }

    // Generate or load embeddings
    const embeddings = await this.getEmbeddings(refinedFunctionSummaries, summariesHash);
    
    // Prepare data structures
    const { funcToIndex, indexToFunc, n } = this.prepareData(refinedFunctionSummaries);
    
    // Create similarity matrix from embeddings
    const similarityMatrix = this.createSimilarityMatrix(embeddings, funcToIndex, n);
    
    // Create combined matrix with adjacency data
    const combinedMatrix = this.createCombinedMatrix(
      callGraphItems,
      funcToIndex,
      similarityMatrix,
      n
    );
    
    // Find optimal clusters
    const result = await findOptimalClusters(combinedMatrix, {
      maxClusters: Math.min(Math.floor(n / 3), 12),
      algorithm: 'spectral',
      algorithmParams: { 
        affinity: 'nearest_neighbors' 
      },
      metrics: ['silhouette', 'calinskiHarabasz'],
      scoringFunction: (evaluation) => {
        // Custom scoring function matching Python behavior
        const silhouette = evaluation.silhouette || 0;
        const calinskiHarabasz = evaluation.calinskiHarabasz || 0;
        return silhouette * 2 + calinskiHarabasz;
      }
    });
    
    // Convert cluster labels to grouped function names
    const groupedClusters = this.groupClustersByLabel(result.labels, indexToFunc);
    
    // Order clusters by average distance to centroid
    const orderedClusters = this.orderClustersByCentroid(
      groupedClusters,
      embeddings,
      funcToIndex
    );
    
    // Cache the results
    await this.saveClusters(orderedClusters, summariesHash);
    
    return orderedClusters;
  }

  /**
   * Generate embeddings for function summaries using configured provider
   */
  private async embedSummaries(summaries: Record<string, string>): Promise<Record<string, number[]>> {
    if (!this.embeddingProvider) {
      throw new Error('Embedding provider not initialized');
    }

    const summaryTexts = Object.values(summaries);
    const summaryKeys = Object.keys(summaries);
    
    // Get embeddings from provider
    const embeddings = await this.embeddingProvider.getEmbeddings(summaryTexts);
    
    const result: Record<string, number[]> = {};
    embeddings.forEach((embedding, index) => {
      result[summaryKeys[index]] = embedding;
    });
    
    return result;
  }

  /**
   * Hash summaries for caching (includes provider type)
   */
  private hashSummaries(summaries: Record<string, string>, provider: string): string {
    const hash = crypto.createHash("md5");
    hash.update(JSON.stringify({ summaries, provider }));
    return hash.digest("hex").substring(0, 8);
  }

  /**
   * Get embeddings from cache or generate new ones
   */
  private async getEmbeddings(
    summaries: Record<string, string>,
    summariesHash: string
  ): Promise<Record<string, number[]>> {
    const embeddingsPath = vscode.Uri.joinPath(
      this.workDir,
      "embeddings",
      `${summariesHash}.json`
    );
    
    // Try to load cached embeddings
    try {
      const cached = await vscode.workspace.fs.readFile(embeddingsPath);
      const cachedData = JSON.parse(cached.toString()) as EmbeddingCache;
      console.log(`Loaded cached embeddings from ${embeddingsPath.fsPath}`);
      return cachedData;
    } catch (error) {
      console.log("No cached embeddings found, generating new ones...");
    }
    
    // Generate new embeddings
    const embeddings = await this.embedSummaries(summaries);
    
    // Cache the embeddings
    await this.ensureDirectory(vscode.Uri.joinPath(this.workDir, "embeddings"));
    await vscode.workspace.fs.writeFile(
      embeddingsPath,
      new TextEncoder().encode(JSON.stringify(embeddings))
    );
    console.log(`Saved embeddings to ${embeddingsPath.fsPath}`);
    
    return embeddings;
  }

  // ... rest of the methods remain the same as original ...
  
  private prepareData(summaries: Record<string, string>) {
    const funcNames = Object.keys(summaries);
    const funcToIndex: Record<string, number> = {};
    const indexToFunc: Record<number, string> = {};
    
    funcNames.forEach((name, index) => {
      funcToIndex[name] = index;
      indexToFunc[index] = name;
    });
    
    return { funcToIndex, indexToFunc, n: funcNames.length };
  }

  private createSimilarityMatrix(
    embeddings: Record<string, number[]>,
    funcToIndex: Record<string, number>,
    n: number
  ): number[][] {
    // Initialize similarity matrix
    const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    
    const funcNames = Object.keys(funcToIndex);
    
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 1.0;
        } else {
          const similarity = this.cosineSimilarity(
            embeddings[funcNames[i]],
            embeddings[funcNames[j]]
          );
          matrix[i][j] = similarity;
          matrix[j][i] = similarity;
        }
      }
    }
    
    return matrix;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private createCombinedMatrix(
    callGraphItems: Record<string, CallGraphNode>,
    funcToIndex: Record<string, number>,
    similarityMatrix: number[][],
    n: number
  ): number[][] {
    // Create adjacency matrix
    const adjacencyMatrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    
    // Fill adjacency matrix
    Object.entries(callGraphItems).forEach(([symbol, node]) => {
      const i = funcToIndex[symbol];
      if (i === undefined) return;
      
      node.calls.forEach(call => {
        const j = funcToIndex[call.symbol];
        if (j !== undefined && i !== j) {
          adjacencyMatrix[i][j] = 1;
          adjacencyMatrix[j][i] = 1; // Make symmetric
        }
      });
    });
    
    // Combine matrices (50/50 weight)
    const combinedMatrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        combinedMatrix[i][j] = 0.5 * similarityMatrix[i][j] + 0.5 * adjacencyMatrix[i][j];
      }
    }
    
    return combinedMatrix;
  }

  private groupClustersByLabel(
    labels: number[],
    indexToFunc: Record<number, string>
  ): string[][] {
    const clusters: Record<number, string[]> = {};
    
    labels.forEach((label, index) => {
      if (!clusters[label]) {
        clusters[label] = [];
      }
      clusters[label].push(indexToFunc[index]);
    });
    
    return Object.values(clusters);
  }

  private orderClustersByCentroid(
    clusters: string[][],
    embeddings: Record<string, number[]>,
    funcToIndex: Record<string, number>
  ): string[][] {
    const clusterDistances: Array<{ cluster: string[]; distance: number }> = [];
    
    clusters.forEach(cluster => {
      // Calculate centroid
      const centroid = this.calculateCentroid(cluster, embeddings);
      
      // Calculate average distance to centroid
      let totalDistance = 0;
      cluster.forEach(func => {
        totalDistance += this.euclideanDistance(embeddings[func], centroid);
      });
      
      clusterDistances.push({
        cluster,
        distance: totalDistance / cluster.length
      });
    });
    
    // Sort by distance (ascending)
    clusterDistances.sort((a, b) => a.distance - b.distance);
    
    return clusterDistances.map(item => item.cluster);
  }

  private calculateCentroid(cluster: string[], embeddings: Record<string, number[]>): number[] {
    const dimension = embeddings[cluster[0]].length;
    const centroid = Array(dimension).fill(0);
    
    cluster.forEach(func => {
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

  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
  }

  private async loadCachedClusters(summariesHash: string): Promise<string[][] | null> {
    const clustersPath = vscode.Uri.joinPath(
      this.workDir,
      "clusters",
      `${summariesHash}.json`
    );
    
    try {
      const cached = await vscode.workspace.fs.readFile(clustersPath);
      const clusters = JSON.parse(cached.toString()) as string[][];
      console.log(`Loaded cached clusters from ${clustersPath.fsPath}`);
      return clusters;
    } catch (error) {
      return null;
    }
  }

  private async saveClusters(clusters: string[][], summariesHash: string): Promise<void> {
    const clustersPath = vscode.Uri.joinPath(
      this.workDir,
      "clusters",
      `${summariesHash}.json`
    );
    
    await this.ensureDirectory(vscode.Uri.joinPath(this.workDir, "clusters"));
    await vscode.workspace.fs.writeFile(
      clustersPath,
      new TextEncoder().encode(JSON.stringify(clusters))
    );
    console.log(`Saved clusters to ${clustersPath.fsPath}`);
  }

  private async ensureDirectory(uri: vscode.Uri): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(uri);
    } catch (error) {
      // Directory might already exist
    }
  }
}