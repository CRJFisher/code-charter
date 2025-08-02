import { CallGraphNode } from "@ariadnejs/types";
import { findOptimalClusters } from "clustering-tfjs";
import * as crypto from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import { OpenAI } from "openai";

interface EmbeddingCache {
  [key: string]: number[];
}

export class ClusteringService {
  private openAIClient: OpenAI;
  private workDir: vscode.Uri;

  constructor(apiKey: string, workDir: vscode.Uri) {
    this.openAIClient = new OpenAI({ apiKey });
    this.workDir = workDir;
  }

  /**
   * Main clustering function that mimics the Python service behavior
   */
  async cluster(
    refinedFunctionSummaries: Record<string, string>,
    callGraphItems: Record<string, CallGraphNode>
  ): Promise<string[][]> {
    // Generate hash for caching
    const summariesHash = this.hashSummaries(refinedFunctionSummaries);
    
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
    
    // Perform clustering
    const clusters = await this.performClustering(combinedMatrix, indexToFunc);
    
    // Order clusters by distance to centroid
    const orderedClusters = this.orderClustersByDistanceToCentroid(clusters, embeddings);
    
    // Convert to array format expected by the extension
    const clusterSymbols = Object.values(orderedClusters);
    
    // Cache the results
    await this.saveClusters(summariesHash, clusterSymbols);
    
    return clusterSymbols;
  }

  /**
   * Generate embeddings for function summaries using OpenAI
   */
  private async embedSummaries(summaries: Record<string, string>): Promise<Record<string, number[]>> {
    const summaryTexts = Object.values(summaries);
    const summaryKeys = Object.keys(summaries);
    
    // Use OpenAI embeddings API
    const response = await this.openAIClient.embeddings.create({
      input: summaryTexts,
      model: "text-embedding-ada-002"
    });
    
    const result: Record<string, number[]> = {};
    response.data.forEach((embedding, index) => {
      result[summaryKeys[index]] = embedding.embedding;
    });
    
    return result;
  }

  /**
   * Hash summaries for caching
   */
  private hashSummaries(summaries: Record<string, string>): string {
    const hash = crypto.createHash("md5");
    hash.update(JSON.stringify(summaries));
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
    
    try {
      const data = await vscode.workspace.fs.readFile(embeddingsPath);
      return JSON.parse(data.toString());
    } catch {
      // Generate new embeddings
      const embeddings = await this.embedSummaries(summaries);
      
      // Save to cache
      await this.saveEmbeddings(embeddingsPath, embeddings);
      
      return embeddings;
    }
  }

  /**
   * Save embeddings to cache
   */
  private async saveEmbeddings(embeddingsPath: vscode.Uri, embeddings: Record<string, number[]>) {
    const dir = vscode.Uri.joinPath(this.workDir, "embeddings");
    try {
      await vscode.workspace.fs.createDirectory(dir);
    } catch {
      // Directory might already exist
    }
    
    const data = new TextEncoder().encode(JSON.stringify(embeddings, null, 2));
    await vscode.workspace.fs.writeFile(embeddingsPath, data);
  }

  /**
   * Prepare data structures for clustering
   */
  private prepareData(summaries: Record<string, string>) {
    const functionNames = Object.keys(summaries);
    const funcToIndex: Record<string, number> = {};
    const indexToFunc: Record<number, string> = {};
    
    functionNames.forEach((name, index) => {
      funcToIndex[name] = index;
      indexToFunc[index] = name;
    });
    
    return { funcToIndex, indexToFunc, n: functionNames.length };
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);
    
    return dotProduct / (norm1 * norm2);
  }

  /**
   * Create similarity matrix from embeddings
   */
  private createSimilarityMatrix(
    embeddings: Record<string, number[]>,
    funcToIndex: Record<string, number>,
    n: number
  ): number[][] {
    const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    
    Object.entries(embeddings).forEach(([func1, vec1]) => {
      const i = funcToIndex[func1];
      if (i === undefined) return;
      
      Object.entries(embeddings).forEach(([func2, vec2]) => {
        const j = funcToIndex[func2];
        if (j === undefined || i === j) return;
        
        const similarity = this.cosineSimilarity(vec1, vec2);
        matrix[i][j] = similarity;
        matrix[j][i] = similarity; // Ensure symmetry
      });
    });
    
    return matrix;
  }

  /**
   * Normalize matrix using L1 normalization
   */
  private normalizeMatrix(matrix: number[][]): number[][] {
    const n = matrix.length;
    const normalized: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
      let rowSum = 0;
      for (let j = 0; j < n; j++) {
        rowSum += Math.abs(matrix[i][j]);
      }
      
      if (rowSum > 0) {
        for (let j = 0; j < n; j++) {
          normalized[i][j] = matrix[i][j] / rowSum;
        }
      }
    }
    
    return normalized;
  }

  /**
   * Create combined matrix from similarity and adjacency data
   */
  private createCombinedMatrix(
    callGraphItems: Record<string, CallGraphNode>,
    funcToIndex: Record<string, number>,
    similarityMatrix: number[][],
    n: number
  ): number[][] {
    // Create adjacency matrix
    const adjacencyMatrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    
    Object.entries(callGraphItems).forEach(([symbol, node]) => {
      const i = funcToIndex[symbol];
      if (i === undefined) return;
      
      node.calls.forEach(call => {
        const j = funcToIndex[call.symbol];
        if (j !== undefined && i !== j) {
          adjacencyMatrix[i][j] = 1;
          adjacencyMatrix[j][i] = 1;
        }
      });
    });
    
    // Normalize both matrices
    const similarityNormalized = this.normalizeMatrix(similarityMatrix);
    const adjacencyNormalized = this.normalizeMatrix(adjacencyMatrix);
    
    // Combine with 50/50 weighting
    const combinedMatrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        combinedMatrix[i][j] = 0.5 * adjacencyNormalized[i][j] + 0.5 * similarityNormalized[i][j];
      }
    }
    
    return combinedMatrix;
  }

  /**
   * Perform clustering using clustering-tfjs
   */
  private async performClustering(
    similarityMatrix: number[][],
    indexToFunc: Record<number, string>
  ): Promise<Record<number, string[]>> {
    // Convert similarity matrix to distance matrix for clustering
    const n = similarityMatrix.length;
    const distanceMatrix = similarityMatrix.map(row => 
      row.map(val => 1 - val)
    );
    
    // Set diagonal to 0
    for (let i = 0; i < n; i++) {
      distanceMatrix[i][i] = 0;
    }
    
    // Use findOptimalClusters with spectral clustering
    const result = await findOptimalClusters(distanceMatrix, {
      maxClusters: Math.floor(n / 3), // Match Python implementation
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
    
    // Map labels back to function names
    const clusters: Record<number, string[]> = {};
    result.labels.forEach((label, idx) => {
      const funcName = indexToFunc[idx];
      if (!clusters[label]) {
        clusters[label] = [];
      }
      clusters[label].push(funcName);
    });
    
    return clusters;
  }

  /**
   * Calculate centroid of a cluster
   */
  private calculateCentroid(
    cluster: string[],
    embeddings: Record<string, number[]>
  ): number[] {
    const vectors = cluster.map(func => embeddings[func]);
    const dimension = vectors[0].length;
    const centroid = new Array(dimension).fill(0);
    
    vectors.forEach(vec => {
      for (let i = 0; i < dimension; i++) {
        centroid[i] += vec[i];
      }
    });
    
    for (let i = 0; i < dimension; i++) {
      centroid[i] /= vectors.length;
    }
    
    return centroid;
  }

  /**
   * Order clusters by distance to centroid
   */
  private orderClustersByDistanceToCentroid(
    clusters: Record<number, string[]>,
    embeddings: Record<string, number[]>
  ): Record<number, string[]> {
    const orderedClusters: Record<number, string[]> = {};
    
    Object.entries(clusters).forEach(([label, cluster]) => {
      const centroid = this.calculateCentroid(cluster, embeddings);
      
      // Sort by distance to centroid (descending similarity)
      const ordered = cluster.sort((a, b) => {
        const simA = this.cosineSimilarity(centroid, embeddings[a]);
        const simB = this.cosineSimilarity(centroid, embeddings[b]);
        return simB - simA;
      });
      
      orderedClusters[parseInt(label)] = ordered;
    });
    
    return orderedClusters;
  }

  /**
   * Load cached clusters if available
   */
  private async loadCachedClusters(summariesHash: string): Promise<string[][] | null> {
    const clustersPath = vscode.Uri.joinPath(
      this.workDir,
      "clusters",
      `${summariesHash}.json`
    );
    
    try {
      const data = await vscode.workspace.fs.readFile(clustersPath);
      return JSON.parse(data.toString());
    } catch {
      return null;
    }
  }

  /**
   * Save clusters to cache
   */
  private async saveClusters(summariesHash: string, clusters: string[][]) {
    const dir = vscode.Uri.joinPath(this.workDir, "clusters");
    try {
      await vscode.workspace.fs.createDirectory(dir);
    } catch {
      // Directory might already exist
    }
    
    const clustersPath = vscode.Uri.joinPath(dir, `${summariesHash}.json`);
    const data = new TextEncoder().encode(JSON.stringify(clusters, null, 2));
    await vscode.workspace.fs.writeFile(clustersPath, data);
  }
}