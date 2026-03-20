import { run_clustering } from "../clustering_adapter";
import type { ClusteringConfig } from "@code-charter/types";

// The mock is loaded via moduleNameMapper in jest.config.js
const { findOptimalClusters } = require("clustering-tfjs");

describe("run_clustering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("with standard algorithms (spectral, kmeans, agglomerative)", () => {
    it("maps config to findOptimalClusters options correctly", async () => {
      const config: ClusteringConfig = {
        algorithm: "spectral",
        min_clusters: 2,
        max_clusters: 8,
        algorithm_params: { affinity: "nearest_neighbors", n_neighbors: 5 },
        metrics: ["silhouette", "calinski_harabasz"],
      };

      const data = [
        [1, 0],
        [0, 1],
        [1, 1],
      ];

      await run_clustering(data, config);

      expect(findOptimalClusters).toHaveBeenCalledWith(
        data,
        expect.objectContaining({
          minClusters: 2,
          maxClusters: 8,
          algorithm: "spectral",
          algorithmParams: expect.objectContaining({
            affinity: "nearest_neighbors",
            nNeighbors: 5,
          }),
        })
      );
    });

    it("returns correctly structured ClusteringResult", async () => {
      const config: ClusteringConfig = {
        algorithm: "kmeans",
        max_clusters: 5,
      };
      const data = [
        [1, 0],
        [0, 1],
        [1, 1],
        [0.5, 0.5],
        [0.9, 0.1],
      ];

      const result = await run_clustering(data, config);

      expect(result).toHaveProperty("labels");
      expect(result).toHaveProperty("n_clusters");
      expect(result).toHaveProperty("scores");
      expect(result).toHaveProperty("all_evaluations");
      expect(Array.isArray(result.labels)).toBe(true);
      expect(typeof result.n_clusters).toBe("number");
      expect(result.scores).toHaveProperty("silhouette");
      expect(result.scores).toHaveProperty("davies_bouldin");
      expect(result.scores).toHaveProperty("calinski_harabasz");
    });

    it("uses result.optimal.labels (NOT result.labels)", async () => {
      // This test catches the critical bug where code used result.labels
      // instead of result.optimal.labels
      findOptimalClusters.mockResolvedValueOnce({
        optimal: {
          k: 2,
          silhouette: 0.8,
          daviesBouldin: 0.3,
          calinskiHarabasz: 200,
          combinedScore: 3.6,
          labels: [0, 1, 0, 1, 0],
        },
        evaluations: [],
      });

      const config: ClusteringConfig = {
        algorithm: "spectral",
        max_clusters: 5,
      };
      const data = [
        [1, 0],
        [0, 1],
        [1, 1],
        [0.5, 0.5],
        [0.9, 0.1],
      ];

      const result = await run_clustering(data, config);

      // Labels should come from result.optimal.labels
      expect(result.labels).toEqual([0, 1, 0, 1, 0]);
      expect(result.n_clusters).toBe(2);
    });

    it("maps scoring function from snake_case to camelCase", async () => {
      let captured_scoring_fn: any;
      findOptimalClusters.mockImplementationOnce((_data: any, opts: any) => {
        captured_scoring_fn = opts.scoringFunction;
        return Promise.resolve({
          optimal: {
            k: 2,
            silhouette: 0.5,
            daviesBouldin: 0.4,
            calinskiHarabasz: 100,
            combinedScore: 2,
            labels: [0, 1],
          },
          evaluations: [],
        });
      });

      const config: ClusteringConfig = {
        algorithm: "spectral",
        max_clusters: 5,
        scoring_function: (scores) => {
          return (scores.silhouette ?? 0) * 3 + (scores.calinski_harabasz ?? 0);
        },
      };

      await run_clustering([[1], [2]], config);

      // The scoring function should receive camelCase from the library
      // and the adapter maps it to snake_case for our scoring_function
      expect(captured_scoring_fn).toBeDefined();
      const score = captured_scoring_fn({
        silhouette: 0.8,
        daviesBouldin: 0.3,
        calinskiHarabasz: 100,
        combinedScore: 2,
      });
      expect(score).toBeCloseTo(0.8 * 3 + 100);
    });
  });

  describe("metric mapping", () => {
    it("maps snake_case metrics to camelCase", async () => {
      const config: ClusteringConfig = {
        algorithm: "spectral",
        max_clusters: 5,
        metrics: ["silhouette", "davies_bouldin", "calinski_harabasz"],
      };

      await run_clustering([[1], [2], [3]], config);

      expect(findOptimalClusters).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metrics: ["silhouette", "daviesBouldin", "calinskiHarabasz"],
        })
      );
    });
  });
});
