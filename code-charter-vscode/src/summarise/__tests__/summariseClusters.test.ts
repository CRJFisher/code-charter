import { ClusterGraph, getClusterDepthLevels, getClusterDependencySequence } from "../summariseClusters";

import { jest } from "@jest/globals";

import * as summeriseClusters from "../summariseClusters";

describe("getClusterDependencySequence", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test("should return correct sequence for a simple linear dependency", () => {
    const rootClusterId = "A";

    const clusterGraph: ClusterGraph = {
      clusterIdToMembers: {
        A: [],
        B: [],
        C: [],
      },
      clusterIdToParentClusterIds: {
        A: [],
        B: ["A"],
        C: ["B"],
      },
      clusterIdToChildClusterIds: {
        A: ["B"],
        B: ["C"],
        C: [],
      },
    };

    // Mocking getClusterDepthLevels
    jest.spyOn(summeriseClusters, "getClusterDepthLevels").mockReturnValue({
      A: new Set([0]),
      B: new Set([1]),
      C: new Set([2]),
    });

    const result = summeriseClusters.getClusterDependencySequence(rootClusterId, clusterGraph);

    expect(result).toEqual([["A"], ["B"], ["C"]]);
  });

  test("should handle circular dependencies gracefully", () => {
    const rootClusterId = "A";

    const clusterGraph: ClusterGraph = {
      clusterIdToMembers: {
        A: [],
        B: [],
        C: [],
      },
      clusterIdToParentClusterIds: {
        A: ["C"],
        B: ["A"],
        C: ["B"],
      },
      clusterIdToChildClusterIds: {
        A: ["B"],
        B: ["C"],
        C: ["A"],
      },
    };

    jest.spyOn(summeriseClusters, "getClusterDepthLevels").mockReturnValue({
      A: new Set([0, 3]),
      B: new Set([1]),
      C: new Set([2]),
    });

    const result = summeriseClusters.getClusterDependencySequence(rootClusterId, clusterGraph);

    expect(result).toEqual([["A"], ["B"], ["C"]]);
  });

  test("should select clusters with the fewest unused dependencies", () => {
    const rootClusterId = "A";

    const clusterGraph: ClusterGraph = {
      clusterIdToMembers: {
        A: [],
        B: [],
        C: [],
        D: [],
      },
      clusterIdToParentClusterIds: {
        A: [],
        B: ["A"],
        C: ["A"],
        D: ["B", "C"],
      },
      clusterIdToChildClusterIds: {
        A: ["B", "C"],
        B: ["D"],
        C: ["D"],
        D: [],
      },
    };

    jest.spyOn(summeriseClusters, "getClusterDepthLevels").mockReturnValue({
      A: new Set([0]),
      B: new Set([1]),
      C: new Set([1]),
      D: new Set([2]),
    });

    const result = summeriseClusters.getClusterDependencySequence(rootClusterId, clusterGraph);

    expect(result).toEqual([["A"], ["B", "C"], ["D"]]);
  });

  test("should throw an error when no clusters are found at a sequence index", () => {
    const rootClusterId = "A";

    const clusterGraph: ClusterGraph = {
      clusterIdToMembers: {
        A: [],
        B: [],
      },
      clusterIdToParentClusterIds: {
        A: [],
        B: [],
      },
      clusterIdToChildClusterIds: {
        A: [],
        B: [],
      },
    };

    jest.spyOn(summeriseClusters, "getClusterDepthLevels").mockReturnValue({
      A: new Set([0]),
      B: new Set([2]), // No clusters at index 1
    });

    expect(() => {
      summeriseClusters.getClusterDependencySequence(rootClusterId, clusterGraph);
    }).toThrow("No clusters at sequence index 1");
  });

  test("should ignore dependencies when cycles mean they cant be fulfilled", () => {
    const rootClusterId = "A";

    const clusterGraph: ClusterGraph = {
      clusterIdToMembers: {
        A: [],
        B: [],
        C: [],
        D: [],
      },
      clusterIdToParentClusterIds: {
        A: [],
        B: ["A", "D"],
        C: ["B"],
        D: ["C"],
      },
      clusterIdToChildClusterIds: {
        A: ["B"],
        B: ["C"],
        C: ["D"],
        D: ["B"],
      },
    };

    jest.spyOn(summeriseClusters, "getClusterDepthLevels").mockReturnValue({
      A: new Set([0]),
      B: new Set([1, 4]),
      C: new Set([2]),
      D: new Set([3]),
    });

    const result = summeriseClusters.getClusterDependencySequence(rootClusterId, clusterGraph);

    expect(result).toEqual([["A"], ["B"], ["C"], ["D"]]);
  });

  test("should ignore dependencies when cycles mean they cant be fulfilled", () => {
    const rootClusterId = "A";

    const clusterGraph: ClusterGraph = {
      clusterIdToMembers: {
        A: [],
        B: [],
        C: [],
        D: [],
      },
      clusterIdToParentClusterIds: {
        A: [],
        B: ["A", "D"],
        C: ["B"],
        D: ["C"],
      },
      clusterIdToChildClusterIds: {
        A: ["B"],
        B: ["C"],
        C: ["D"],
        D: ["B"],
      },
    };

    jest.spyOn(summeriseClusters, "getClusterDepthLevels").mockReturnValue({
      A: new Set([0]),
      B: new Set([1, 4]),
      C: new Set([2]),
      D: new Set([3]),
    });

    const result = summeriseClusters.getClusterDependencySequence(rootClusterId, clusterGraph);

    expect(result).toEqual([["A"], ["B"], ["C"], ["D"]]);
  });

  test("should prioritize clusters with the fewest unused dependencies at the same sequence index", () => {
    const rootClusterId = "A";

    const clusterGraph: ClusterGraph = {
      clusterIdToMembers: {
        A: [],
        B: [],
        C: [],
        D: [],
        E: [],
      },
      clusterIdToParentClusterIds: {
        A: [],
        B: ["A"],
        C: ["A"],
        D: ["B", "C"],
        E: ["B"],
      },
      clusterIdToChildClusterIds: {
        A: ["B", "C"],
        B: ["D", "E"],
        C: ["D"],
        D: [],
        E: [],
      },
    };

    // Mocking getClusterDepthLevels
    jest.spyOn(summeriseClusters, "getClusterDepthLevels").mockReturnValue({
      A: new Set([0]),
      B: new Set([1]),
      C: new Set([1]),
      D: new Set([2]),
      E: new Set([2]),
    });

    const result = summeriseClusters.getClusterDependencySequence(rootClusterId, clusterGraph);

    expect(result).toEqual([["A"], ["B", "C"], ["D", "E"]]);
  });
});

describe("getClusterDepthLevels", () => {
  test("should return correct depth levels for a simple tree", () => {
    const clusterGraph: ClusterGraph = {
      clusterIdToMembers: {
        A: [],
        B: [],
        C: [],
      },
      clusterIdToParentClusterIds: {
        A: [],
        B: ["A"],
        C: ["B"],
      },
      clusterIdToChildClusterIds: {
        A: ["B"],
        B: ["C"],
        C: [],
      },
    };

    const result = getClusterDepthLevels("A", clusterGraph);

    expect(result).toEqual({
      A: new Set([0]),
      B: new Set([1]),
      C: new Set([2]),
    });
  });

  test("should handle a cycle and include depths for both branches", () => {
    const clusterGraph: ClusterGraph = {
      clusterIdToMembers: {
        A: [],
        B: [],
        C: [],
        D: [],
      },
      clusterIdToParentClusterIds: {
        A: [],
        B: ["A", "D"],
        C: ["B"],
        D: ["C"],
      },
      clusterIdToChildClusterIds: {
        A: ["B"],
        B: ["C"],
        C: ["D"],
        D: ["B"],
      },
    };

    const result = getClusterDepthLevels("A", clusterGraph);

    expect(result).toEqual({
      A: new Set([0]),
      B: new Set([1, 4]),
      C: new Set([2]),
      D: new Set([3]),
    });
  });

  test("should handle a complex graph with cycles and branches", () => {
    const clusterGraph: ClusterGraph = {
      clusterIdToMembers: {
        A: [],
        B: [],
        C: [],
        D: [],
        E: [],
      },
      clusterIdToParentClusterIds: {
        A: [],
        B: ["A", "D"],
        C: ["A"],
        D: ["B"],
        E: ["C"],
      },
      clusterIdToChildClusterIds: {
        A: ["B", "C"],
        B: ["D"],
        C: ["E"],
        D: ["B"], // Cycle back to B
        E: [],
      },
    };

    const result = getClusterDepthLevels("A", clusterGraph);

    expect(result).toEqual({
      A: new Set([0]),
      B: new Set([1, 3]),
      C: new Set([1]),
      D: new Set([2]),
      E: new Set([2]),
    });
  });

  test("should handle an empty graph", () => {
    const clusterGraph: ClusterGraph = {
      clusterIdToMembers: {},
      clusterIdToParentClusterIds: {},
      clusterIdToChildClusterIds: {},
    };

    const result = getClusterDepthLevels("A", clusterGraph);

    expect(result).toEqual({
      A: new Set([0]),
    });
  });

  test("should handle a graph with disconnected nodes", () => {
    const clusterGraph: ClusterGraph = {
      clusterIdToMembers: {
        A: [],
        B: [],
        C: [],
      },
      clusterIdToParentClusterIds: {
        A: [],
        B: [],
        C: [],
      },
      clusterIdToChildClusterIds: {
        A: [],
        B: [],
        C: [],
      },
    };

    const result = getClusterDepthLevels("A", clusterGraph);

    expect(result).toEqual({
      A: new Set([0]),
    });
  });
});
