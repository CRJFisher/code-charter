declare module 'clustering-tfjs' {
  export interface ClusteringResult {
    labels: number[];
    nClusters: number;
    silhouette?: number;
    calinskiHarabasz?: number;
    daviesBouldin?: number;
  }

  export interface ClusteringOptions {
    maxClusters: number;
    algorithm: 'kmeans' | 'spectral' | 'agglomerative';
    algorithmParams?: {
      affinity?: 'nearest_neighbors' | 'rbf';
      nNeighbors?: number;
      gamma?: number;
    };
    metrics?: Array<'silhouette' | 'calinskiHarabasz' | 'daviesBouldin'>;
    scoringFunction?: (evaluation: {
      silhouette?: number;
      calinskiHarabasz?: number;
      daviesBouldin?: number;
    }) => number;
  }

  export function findOptimalClusters(
    data: number[][] | Float32Array,
    options: ClusteringOptions
  ): Promise<ClusteringResult>;
}