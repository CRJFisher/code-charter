/**
 * Mock for the clustering-tfjs module used in tests.
 */

const find_optimal_clusters = jest.fn().mockResolvedValue({
  optimal: {
    k: 3,
    silhouette: 0.72,
    daviesBouldin: 0.45,
    calinskiHarabasz: 150.5,
    combinedScore: 2.89,
    labels: [0, 1, 0, 2, 1],
  },
  evaluations: [
    {
      k: 2,
      silhouette: 0.65,
      daviesBouldin: 0.52,
      calinskiHarabasz: 120.3,
      combinedScore: 2.5,
      labels: [0, 1, 0, 1, 1],
    },
    {
      k: 3,
      silhouette: 0.72,
      daviesBouldin: 0.45,
      calinskiHarabasz: 150.5,
      combinedScore: 2.89,
      labels: [0, 1, 0, 2, 1],
    },
  ],
});

const mock_som_instance = {
  fit: jest.fn().mockResolvedValue(undefined),
  fitPredict: jest.fn().mockResolvedValue([0, 1, 2, 0, 1]),
  predict: jest.fn().mockResolvedValue([0, 1, 2, 0, 1]),
  partialFit: jest.fn().mockResolvedValue(undefined),
  getWeights: jest.fn().mockReturnValue({
    arraySync: () => [
      [[0.1, 0.2], [0.3, 0.4]],
      [[0.5, 0.6], [0.7, 0.8]],
    ],
  }),
  saveToJSON: jest.fn().mockResolvedValue('{"mock": true}'),
  loadFromJSON: jest.fn().mockResolvedValue(undefined),
  saveState: jest.fn().mockReturnValue({ weights: [], totalSamples: 0, currentEpoch: 0, gridWidth: 2, gridHeight: 2, params: {} }),
  loadState: jest.fn(),
  enableStreamingMode: jest.fn(),
  dispose: jest.fn(),
  params: { gridWidth: 2, gridHeight: 2 },
};

const mock_agglom_instance = {
  fit: jest.fn().mockResolvedValue(undefined),
  fitPredict: jest.fn().mockResolvedValue([0, 1, 0, 1]),
};

const Clustering = {
  init: jest.fn().mockResolvedValue(undefined),
  SOM: jest.fn().mockImplementation(() => ({ ...mock_som_instance })),
  KMeans: jest.fn(),
  SpectralClustering: jest.fn(),
  AgglomerativeClustering: jest.fn().mockImplementation(() => ({ ...mock_agglom_instance })),
};

module.exports = {
  findOptimalClusters: find_optimal_clusters,
  Clustering,
  __mock_som_instance: mock_som_instance,
  __mock_agglom_instance: mock_agglom_instance,
};
