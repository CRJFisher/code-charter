import { ClusterGraph, getClusterDepthLevels, getClusterDependencySequence } from "../summariseClusters";

describe("getClusterDependencySequence", () => {
  test("should process simple linear dependency", () => {
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

    const result = getClusterDependencySequence(rootClusterId, clusterGraph);

    expect(result).toEqual({
      0: [{ clusterId: "A", dependencies: [] }],
      1: [{ clusterId: "B", dependencies: ["A"] }],
      2: [{ clusterId: "C", dependencies: ["B"] }],
    });
  });

  test("should process branching dependencies", () => {
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

    const result = getClusterDependencySequence(rootClusterId, clusterGraph);

    expect(result).toEqual({
      0: [{ clusterId: "A", dependencies: [] }],
      1: [
        { clusterId: "B", dependencies: ["A"] },
        { clusterId: "C", dependencies: ["A"] },
      ],
      2: [{ clusterId: "D", dependencies: ["B", "C"] }],
    });
  });

  test("should handle cyclic dependencies", () => {
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

    const result = getClusterDependencySequence(rootClusterId, clusterGraph);

    expect(result).toEqual({
      0: [{ clusterId: "A", dependencies: [] }],
      1: [{ clusterId: "B", dependencies: ["A"] }],
      2: [{ clusterId: "C", dependencies: ["B"] }],
      3: [{ clusterId: "A", dependencies: ["C"] }],
    });
  });

  test("should handle cluster appearing at multiple depths", () => {
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

    const result = getClusterDependencySequence(rootClusterId, clusterGraph);

    expect(result).toEqual({
      0: [{ clusterId: "A", dependencies: [] }],
      1: [{ clusterId: "B", dependencies: ["A"] }],
      2: [{ clusterId: "C", dependencies: ["B"] }],
      3: [{ clusterId: "A", dependencies: ["C"] }],
    });
  });

  test("should handle self-loop", () => {
    const rootClusterId = "A";

    const clusterGraph: ClusterGraph = {
      clusterIdToMembers: {
        A: [],
      },
      clusterIdToParentClusterIds: {
        A: ["A"],
      },
      clusterIdToChildClusterIds: {
        A: ["A"],
      },
    };

    const result = getClusterDependencySequence(rootClusterId, clusterGraph);

    expect(result).toEqual({
      0: [{ clusterId: "A", dependencies: [] }],
      1: [{ clusterId: "A", dependencies: ["A"] }],
    });
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
