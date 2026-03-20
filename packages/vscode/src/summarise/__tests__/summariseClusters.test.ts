import { ClusterGraph, get_cluster_depth_levels, get_cluster_dependency_sequence } from "../summariseClusters";

describe("get_cluster_dependency_sequence", () => {
  test("should process simple linear dependency", () => {
    const rootClusterId = "A";

    const clusterGraph: ClusterGraph = {
      cluster_id_to_members: {
        A: [],
        B: [],
        C: [],
      },
      cluster_id_to_parent_cluster_ids: {
        A: [],
        B: ["A"],
        C: ["B"],
      },
      cluster_id_to_child_cluster_ids: {
        A: ["B"],
        B: ["C"],
        C: [],
      },
    };

    const result = get_cluster_dependency_sequence(rootClusterId, clusterGraph);

    expect(result).toEqual({
      0: [{ cluster_id: "A", dependencies: [] }],
      1: [{ cluster_id: "B", dependencies: ["A"] }],
      2: [{ cluster_id: "C", dependencies: ["B"] }],
    });
  });

  test("should process branching dependencies", () => {
    const rootClusterId = "A";

    const clusterGraph: ClusterGraph = {
      cluster_id_to_members: {
        A: [],
        B: [],
        C: [],
        D: [],
      },
      cluster_id_to_parent_cluster_ids: {
        A: [],
        B: ["A"],
        C: ["A"],
        D: ["B", "C"],
      },
      cluster_id_to_child_cluster_ids: {
        A: ["B", "C"],
        B: ["D"],
        C: ["D"],
        D: [],
      },
    };

    const result = get_cluster_dependency_sequence(rootClusterId, clusterGraph);

    expect(result).toEqual({
      0: [{ cluster_id: "A", dependencies: [] }],
      1: [
        { cluster_id: "B", dependencies: ["A"] },
        { cluster_id: "C", dependencies: ["A"] },
      ],
      2: [{ cluster_id: "D", dependencies: ["B", "C"] }],
    });
  });

  test("should handle cyclic dependencies", () => {
    const rootClusterId = "A";

    const clusterGraph: ClusterGraph = {
      cluster_id_to_members: {
        A: [],
        B: [],
        C: [],
      },
      cluster_id_to_parent_cluster_ids: {
        A: ["C"],
        B: ["A"],
        C: ["B"],
      },
      cluster_id_to_child_cluster_ids: {
        A: ["B"],
        B: ["C"],
        C: ["A"],
      },
    };

    const result = get_cluster_dependency_sequence(rootClusterId, clusterGraph);

    expect(result).toEqual({
      0: [{ cluster_id: "A", dependencies: [] }],
      1: [{ cluster_id: "B", dependencies: ["A"] }],
      2: [{ cluster_id: "C", dependencies: ["B"] }],
      3: [{ cluster_id: "A", dependencies: ["C"] }],
    });
  });

  test("should handle cluster appearing at multiple depths", () => {
    const rootClusterId = "A";

    const clusterGraph: ClusterGraph = {
      cluster_id_to_members: {
        A: [],
        B: [],
        C: [],
      },
      cluster_id_to_parent_cluster_ids: {
        A: ["C"],
        B: ["A"],
        C: ["B"],
      },
      cluster_id_to_child_cluster_ids: {
        A: ["B"],
        B: ["C"],
        C: ["A"],
      },
    };

    const result = get_cluster_dependency_sequence(rootClusterId, clusterGraph);

    expect(result).toEqual({
      0: [{ cluster_id: "A", dependencies: [] }],
      1: [{ cluster_id: "B", dependencies: ["A"] }],
      2: [{ cluster_id: "C", dependencies: ["B"] }],
      3: [{ cluster_id: "A", dependencies: ["C"] }],
    });
  });

  test("should handle self-loop", () => {
    const rootClusterId = "A";

    const clusterGraph: ClusterGraph = {
      cluster_id_to_members: {
        A: [],
      },
      cluster_id_to_parent_cluster_ids: {
        A: ["A"],
      },
      cluster_id_to_child_cluster_ids: {
        A: ["A"],
      },
    };

    const result = get_cluster_dependency_sequence(rootClusterId, clusterGraph);

    expect(result).toEqual({
      0: [{ cluster_id: "A", dependencies: [] }],
      1: [{ cluster_id: "A", dependencies: ["A"] }],
    });
  });
});

describe("get_cluster_depth_levels", () => {
  test("should return correct depth levels for a simple tree", () => {
    const clusterGraph: ClusterGraph = {
      cluster_id_to_members: {
        A: [],
        B: [],
        C: [],
      },
      cluster_id_to_parent_cluster_ids: {
        A: [],
        B: ["A"],
        C: ["B"],
      },
      cluster_id_to_child_cluster_ids: {
        A: ["B"],
        B: ["C"],
        C: [],
      },
    };

    const result = get_cluster_depth_levels("A", clusterGraph);

    expect(result).toEqual({
      A: new Set([0]),
      B: new Set([1]),
      C: new Set([2]),
    });
  });

  test("should handle a cycle and include depths for both branches", () => {
    const clusterGraph: ClusterGraph = {
      cluster_id_to_members: {
        A: [],
        B: [],
        C: [],
        D: [],
      },
      cluster_id_to_parent_cluster_ids: {
        A: [],
        B: ["A", "D"],
        C: ["B"],
        D: ["C"],
      },
      cluster_id_to_child_cluster_ids: {
        A: ["B"],
        B: ["C"],
        C: ["D"],
        D: ["B"],
      },
    };

    const result = get_cluster_depth_levels("A", clusterGraph);

    expect(result).toEqual({
      A: new Set([0]),
      B: new Set([1, 4]),
      C: new Set([2]),
      D: new Set([3]),
    });
  });

  test("should handle a complex graph with cycles and branches", () => {
    const clusterGraph: ClusterGraph = {
      cluster_id_to_members: {
        A: [],
        B: [],
        C: [],
        D: [],
        E: [],
      },
      cluster_id_to_parent_cluster_ids: {
        A: [],
        B: ["A", "D"],
        C: ["A"],
        D: ["B"],
        E: ["C"],
      },
      cluster_id_to_child_cluster_ids: {
        A: ["B", "C"],
        B: ["D"],
        C: ["E"],
        D: ["B"], // Cycle back to B
        E: [],
      },
    };

    const result = get_cluster_depth_levels("A", clusterGraph);

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
      cluster_id_to_members: {},
      cluster_id_to_parent_cluster_ids: {},
      cluster_id_to_child_cluster_ids: {},
    };

    const result = get_cluster_depth_levels("A", clusterGraph);

    expect(result).toEqual({
      A: new Set([0]),
    });
  });

  test("should handle a graph with disconnected nodes", () => {
    const clusterGraph: ClusterGraph = {
      cluster_id_to_members: {
        A: [],
        B: [],
        C: [],
      },
      cluster_id_to_parent_cluster_ids: {
        A: [],
        B: [],
        C: [],
      },
      cluster_id_to_child_cluster_ids: {
        A: [],
        B: [],
        C: [],
      },
    };

    const result = get_cluster_depth_levels("A", clusterGraph);

    expect(result).toEqual({
      A: new Set([0]),
    });
  });
});
