import type { CallGraph, SymbolId } from "@ariadnejs/types";

export interface ClusterMember {
  symbol: string;
  description: string;
}

export interface ClusterGraph {
  cluster_id_to_members: Record<string, ClusterMember[]>;
  cluster_id_to_parent_cluster_ids: Record<string, string[]>;
  cluster_id_to_child_cluster_ids: Record<string, string[]>;
}

export interface ClusterDependencies {
  cluster_id: string;
  dependencies: string[];
}

export function get_cluster_dependency_sequence(
  root_cluster_id: string,
  cluster_graph: ClusterGraph
): { [sequence_index: number]: ClusterDependencies[] } {
  /**
   * If possible, we want the cluster to be processed after all its dependencies have been processed.
   * If there is a circular dependency in the graph, we need to process it (at least) twice - once with
   * a restricted context (so the sequence can progress) and then with the full context.
   * E.g. in A -> B -> C -> A, we can't include A in A's context in the first pass but we can once C has been processed.
   */
  const cluster_sequence: { [sequence_index: number]: ClusterDependencies[] } = {};
  const cluster_depth_levels = get_cluster_depth_levels(root_cluster_id, cluster_graph);
  for (const [cluster_id, depths] of Object.entries(cluster_depth_levels)) {
    for (const depth of depths) {
      if (!cluster_sequence[depth]) {
        cluster_sequence[depth] = [];
      }
      const cluster_dependencies = new Set(cluster_graph.cluster_id_to_parent_cluster_ids[cluster_id] || []);
      const dependencies = Object.entries(cluster_depth_levels)
        .filter(
          ([cid, depths]) => cluster_dependencies.has(cid) && Array.from(depths).some((d) => d < depth)
        )
        .map(([cid]) => cid);
      cluster_sequence[depth].push({ cluster_id, dependencies });
    }
  }
  return cluster_sequence;
}

export function get_cluster_depth_levels(
  start_cluster_id: string,
  cluster_graph: ClusterGraph,
  visited_nodes: Set<string> = new Set(),
  cluster_id_depth_levels: Record<string, Set<number>> = {},
  depth: number = 0
): Record<string, Set<number>> {
  if (cluster_id_depth_levels[start_cluster_id] === undefined) {
    cluster_id_depth_levels[start_cluster_id] = new Set();
  }
  cluster_id_depth_levels[start_cluster_id].add(depth);
  if (visited_nodes.has(start_cluster_id)) {
    return cluster_id_depth_levels;
  }
  visited_nodes.add(start_cluster_id);
  for (const child of cluster_graph.cluster_id_to_child_cluster_ids[start_cluster_id] || []) {
    get_cluster_depth_levels(child, cluster_graph, visited_nodes, cluster_id_depth_levels, depth + 1);
  }
  return cluster_id_depth_levels;
}

export function build_cluster_graph(clusters: ClusterMember[][], call_graph: CallGraph): ClusterGraph {
  const symbol_to_cluster_id: Record<string, string> = {};
  for (const [index, cluster] of clusters.entries()) {
    for (const member of cluster) {
      symbol_to_cluster_id[member.symbol] = `${index}`;
    }
  }

  const cluster_id_to_members: Record<string, ClusterMember[]> = {};
  const cluster_id_to_dependencies: Record<string, string[]> = {};
  const cluster_id_to_dependents: Record<string, string[]> = {};

  for (const [index, cluster] of clusters.entries()) {
    const current_cluster_id = `${index}`;
    cluster_id_to_members[current_cluster_id] = cluster;

    for (const member of cluster) {
      const node = call_graph.nodes.get(member.symbol as SymbolId);
      const dependency_cluster_ids = new Set(
        node?.enclosed_calls
          ?.flatMap((call) => call.resolutions.map((r) => symbol_to_cluster_id[r.symbol_id]))
          .filter((id): id is string => id !== undefined && id !== current_cluster_id) || []
      );

      for (const dep_cluster_id of dependency_cluster_ids) {
        if (!cluster_id_to_dependencies[current_cluster_id]) {
          cluster_id_to_dependencies[current_cluster_id] = [];
        }
        cluster_id_to_dependencies[current_cluster_id].push(dep_cluster_id);

        if (!cluster_id_to_dependents[dep_cluster_id]) {
          cluster_id_to_dependents[dep_cluster_id] = [];
        }
        cluster_id_to_dependents[dep_cluster_id].push(current_cluster_id);
      }
    }
  }

  for (const [cluster_id, dep_cluster_ids] of Object.entries(cluster_id_to_dependencies)) {
    for (const dep_cluster_id of dep_cluster_ids) {
      if (!cluster_id_to_dependents[dep_cluster_id]?.includes(cluster_id)) {
        throw new Error(`Cluster dependencies are not symmetrical: ${cluster_id} depends on ${dep_cluster_id}`);
      }
    }
  }

  return {
    cluster_id_to_members,
    cluster_id_to_child_cluster_ids: cluster_id_to_dependencies,
    cluster_id_to_parent_cluster_ids: cluster_id_to_dependents,
  };
}
