import {
  cosine_similarity,
  euclidean_distance,
  calculate_centroid,
  create_similarity_matrix,
  create_adjacency_matrix,
  normalize_matrix,
  create_combined_matrix,
  group_clusters_by_label,
  order_clusters_by_centroid,
  prepare_data,
} from "../clustering_logic";

describe("cosine_similarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosine_similarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosine_similarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosine_similarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
  });

  it("returns correct value for known angle", () => {
    // [1, 0] and [1, 1] have angle 45 degrees, cos(45) = 1/sqrt(2)
    expect(cosine_similarity([1, 0], [1, 1])).toBeCloseTo(1 / Math.sqrt(2));
  });

  it("returns 0 for zero vector", () => {
    expect(cosine_similarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("euclidean_distance", () => {
  it("returns 0 for same point", () => {
    expect(euclidean_distance([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it("returns correct distance for unit vectors", () => {
    expect(euclidean_distance([1, 0], [0, 1])).toBeCloseTo(Math.sqrt(2));
  });

  it("returns correct distance for 3D points", () => {
    expect(euclidean_distance([0, 0, 0], [3, 4, 0])).toBeCloseTo(5);
  });
});

describe("calculate_centroid", () => {
  it("returns the vector itself for single-element cluster", () => {
    const embeddings = { a: [1, 2, 3] };
    expect(calculate_centroid(["a"], embeddings)).toEqual([1, 2, 3]);
  });

  it("returns the mean for two elements", () => {
    const embeddings = { a: [0, 0], b: [2, 4] };
    expect(calculate_centroid(["a", "b"], embeddings)).toEqual([1, 2]);
  });
});

describe("create_similarity_matrix", () => {
  it("produces a symmetric matrix with 1s on diagonal", () => {
    const embeddings = { a: [1, 0], b: [0, 1], c: [1, 1] };
    const func_to_index = { a: 0, b: 1, c: 2 };
    const matrix = create_similarity_matrix(embeddings, func_to_index, 3);

    // Diagonal is 1
    expect(matrix[0][0]).toBeCloseTo(1.0);
    expect(matrix[1][1]).toBeCloseTo(1.0);
    expect(matrix[2][2]).toBeCloseTo(1.0);

    // Symmetric
    expect(matrix[0][1]).toBeCloseTo(matrix[1][0]);
    expect(matrix[0][2]).toBeCloseTo(matrix[2][0]);
    expect(matrix[1][2]).toBeCloseTo(matrix[2][1]);

    // Known values
    expect(matrix[0][1]).toBeCloseTo(0.0); // orthogonal
    expect(matrix[0][2]).toBeCloseTo(1 / Math.sqrt(2)); // 45 degrees
  });

  it("produces [[1.0]] for single function", () => {
    const embeddings = { a: [1, 2, 3] };
    const func_to_index = { a: 0 };
    const matrix = create_similarity_matrix(embeddings, func_to_index, 1);
    expect(matrix).toEqual([[1.0]]);
  });
});

describe("create_adjacency_matrix", () => {
  it("marks connected functions symmetrically", () => {
    const call_graph = {
      a: { enclosed_calls: [{ resolutions: [{ symbol_id: "b" }] }] },
      b: { enclosed_calls: [] },
    };
    const func_to_index = { a: 0, b: 1 };
    const matrix = create_adjacency_matrix(call_graph, func_to_index, 2);

    expect(matrix[0][1]).toBe(1);
    expect(matrix[1][0]).toBe(1);
    expect(matrix[0][0]).toBe(0);
    expect(matrix[1][1]).toBe(0);
  });

  it("ignores calls to unknown symbols", () => {
    const call_graph = {
      a: { enclosed_calls: [{ resolutions: [{ symbol_id: "unknown" }] }] },
    };
    const func_to_index = { a: 0 };
    const matrix = create_adjacency_matrix(call_graph, func_to_index, 1);
    expect(matrix[0][0]).toBe(0);
  });

  it("ignores self-calls", () => {
    const call_graph = {
      a: { enclosed_calls: [{ resolutions: [{ symbol_id: "a" }] }] },
    };
    const func_to_index = { a: 0 };
    const matrix = create_adjacency_matrix(call_graph, func_to_index, 1);
    expect(matrix[0][0]).toBe(0);
  });

  it("returns all zeros for no connections", () => {
    const call_graph = {
      a: { enclosed_calls: [] },
      b: { enclosed_calls: [] },
    };
    const func_to_index = { a: 0, b: 1 };
    const matrix = create_adjacency_matrix(call_graph, func_to_index, 2);
    expect(matrix).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });
});

describe("normalize_matrix", () => {
  it("L1-normalizes each row so abs values sum to 1", () => {
    const matrix = [
      [2, 4],
      [1, 3],
    ];
    const normalized = normalize_matrix(matrix);

    // Row 0: |2|+|4| = 6, so [2/6, 4/6]
    expect(normalized[0][0]).toBeCloseTo(2 / 6);
    expect(normalized[0][1]).toBeCloseTo(4 / 6);

    // Row 1: |1|+|3| = 4, so [1/4, 3/4]
    expect(normalized[1][0]).toBeCloseTo(1 / 4);
    expect(normalized[1][1]).toBeCloseTo(3 / 4);
  });

  it("leaves all-zero rows as zeros", () => {
    const matrix = [
      [0, 0],
      [1, 1],
    ];
    const normalized = normalize_matrix(matrix);
    expect(normalized[0]).toEqual([0, 0]);
    expect(normalized[1][0]).toBeCloseTo(0.5);
  });
});

describe("create_combined_matrix", () => {
  it("produces 50/50 weighted average of normalized matrices", () => {
    const similarity = [
      [1, 0.5],
      [0.5, 1],
    ];
    const adjacency = [
      [0, 1],
      [1, 0],
    ];
    const combined = create_combined_matrix(similarity, adjacency);

    // Both matrices get L1-normalized first, then combined at 0.5 weight
    expect(combined.length).toBe(2);
    expect(combined[0].length).toBe(2);

    // Values should be in [0, 1] range
    for (const row of combined) {
      for (const val of row) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    }
  });

  it("accepts custom weight", () => {
    const similarity = [
      [1, 0],
      [0, 1],
    ];
    const adjacency = [
      [0, 1],
      [1, 0],
    ];
    const combined_70 = create_combined_matrix(similarity, adjacency, 0.7);
    const combined_30 = create_combined_matrix(similarity, adjacency, 0.3);

    // Different weights should produce different results
    expect(combined_70[0][0]).not.toBeCloseTo(combined_30[0][0]);
  });
});

describe("group_clusters_by_label", () => {
  it("groups labels into clusters", () => {
    const labels = [0, 1, 0, 1, 2];
    const index_to_func = { 0: "a", 1: "b", 2: "c", 3: "d", 4: "e" };
    const groups = group_clusters_by_label(labels, index_to_func);

    expect(groups.length).toBe(3);
    expect(groups[0]).toEqual(["a", "c"]);
    expect(groups[1]).toEqual(["b", "d"]);
    expect(groups[2]).toEqual(["e"]);
  });

  it("produces single group when all same label", () => {
    const labels = [0, 0, 0];
    const index_to_func = { 0: "a", 1: "b", 2: "c" };
    const groups = group_clusters_by_label(labels, index_to_func);
    expect(groups.length).toBe(1);
    expect(groups[0]).toEqual(["a", "b", "c"]);
  });

  it("handles empty labels", () => {
    const groups = group_clusters_by_label([], {});
    expect(groups).toEqual([]);
  });
});

describe("order_clusters_by_centroid", () => {
  it("orders tighter clusters first", () => {
    // Tight cluster: points close together
    const tight = ["a", "b"];
    // Spread cluster: points far apart
    const spread = ["c", "d"];

    const embeddings = {
      a: [0, 0],
      b: [0.1, 0.1],
      c: [0, 0],
      d: [10, 10],
    };

    const ordered = order_clusters_by_centroid([spread, tight], embeddings);

    // Tight cluster should come first (lower average distance to centroid)
    expect(ordered[0]).toEqual(tight);
    expect(ordered[1]).toEqual(spread);
  });
});

describe("prepare_data", () => {
  it("creates correct index mappings", () => {
    const summaries = { a: "desc a", b: "desc b", c: "desc c" };
    const { func_to_index, index_to_func, n } = prepare_data(summaries);

    expect(n).toBe(3);
    expect(func_to_index["a"]).toBe(0);
    expect(func_to_index["b"]).toBe(1);
    expect(func_to_index["c"]).toBe(2);
    expect(index_to_func[0]).toBe("a");
    expect(index_to_func[1]).toBe("b");
    expect(index_to_func[2]).toBe("c");
  });
});
