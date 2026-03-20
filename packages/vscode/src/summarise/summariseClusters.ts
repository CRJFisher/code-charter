import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import {
  Runnable,
  RunnableConfig,
  RunnableLambda,
  RunnableMap,
  RunnableParallel,
  RunnablePassthrough,
} from "@langchain/core/runnables";
import { symbol_repo_local_name } from "../../shared/symbols";
import { ModelDetails } from "src/model";
import type { CallGraph, SymbolId } from "@ariadnejs/types";

interface ClusterMember {
  symbol: string;
  function_summary_string: string;
}

export interface ClusterGraph {
  cluster_id_to_members: Record<string, ClusterMember[]>;
  cluster_id_to_parent_cluster_ids: Record<string, string[]>;
  cluster_id_to_child_cluster_ids: Record<string, string[]>;
}

interface ClusterDependencies {
  cluster_id: string;
  dependencies: string[];
}

export async function get_cluster_descriptions(
  clusters: ClusterMember[][],
  model_details: ModelDetails,
  domain_summary: string,
  call_graph: CallGraph
): Promise<Record<string, string>> {
  const cluster_graph = get_cluster_graph(clusters, call_graph);

  const cluster_sequence = get_cluster_dependency_sequence("0", cluster_graph);
  const sequence_length = Object.keys(cluster_sequence).length;
  const level_runnables = [];
  for (let i = 0; i < sequence_length; i++) {
    level_runnables.push(create_level_runnable(cluster_sequence[i], cluster_graph.cluster_id_to_members, model_details));
  }

  let sequence: Runnable;
  if (level_runnables.length === 0) {
    throw new Error("No levels to process");
  } else {
    // Start with a RunnablePassthrough to pass the initial inputs through
    sequence = new RunnablePassthrough();
    for (const level_runnable of level_runnables) {
      // Pipe each levelRunnable, ensuring inputs are passed along
      sequence = sequence.pipe(
        RunnableParallel.from({
          curr: RunnableLambda.from((inputs: any) => {
            return level_runnable.invoke({ ...inputs.prev, ...inputs.curr });
          }),
          prev: RunnableLambda.from((inputs: any) => ({ ...inputs.prev, ...inputs.curr })),
        })
      );
    }
  }

  const output = await sequence.invoke({ curr: { root: domain_summary }, prev: {} });
  const combined_summaries = { ...output.prev, ...output.curr };
  const cluster_summaries = {};
  for (const cluster_id in Object.keys(cluster_graph.cluster_id_to_members)) {
    cluster_summaries[cluster_id] = combined_summaries[cluster_id];
  }
  return cluster_summaries;
}

interface ClusterContext {
  parent_ids: string[] | undefined;
  cluster_members: ClusterMember[];
}

function build_cluster_summary_prompt(context_summary: ClusterContext): PromptTemplate {
  const is_root = !context_summary.parent_ids || context_summary.parent_ids.length === 0;
  let context: string;
  let input_variables: string[];
  if (is_root) {
    context = `These functions include the entrypoint into the application.
    Connect their meaning to the following high-level domain context about the project:
    """
    {root}
    """`;
    input_variables = ["root"];
  } else {
    context = `Here are the summaries of the modules that depend on this module.
    """
    ${context_summary.parent_ids.map((parent_id) => "{" + parent_id + "}").join("\n")}
    """
    Avoid repeating the same information in the parent descriptions. Instead, focus on what this module does differently or adds to the parent modules.`;
    input_variables = context_summary.parent_ids;
  }
  const function_ids_placeholders = context_summary.cluster_members
    .map((member) => `${symbol_repo_local_name(member.symbol)}\n${member.function_summary_string}`)
    .join("\n\n");
  const template_string = `Function descriptions:
"""
${function_ids_placeholders}
"""
${context}
Write a short, action-focused sentence about **what these functions collectively do** in telegraph-style, without mentioning specific classes, files, or organisational details`;
  return new PromptTemplate({
    inputVariables: input_variables,
    template: template_string,
  });
}

function create_level_runnable(
  clusters_at_level: ClusterDependencies[],
  cluster_id_to_members: Record<string, ClusterMember[]>,
  model_details: ModelDetails
): Runnable<any, any, RunnableConfig> {
  const cluster_id_to_runnable: Record<string, Runnable<any, string, RunnableConfig>> = {};
  for (const cluster of clusters_at_level) {
    const cluster_id = cluster.cluster_id;
    const context = {
      parent_ids: cluster.dependencies,
      cluster_members: cluster_id_to_members[cluster_id],
    };
    const output_parser = new StringOutputParser();
    const summary_chain = build_cluster_summary_prompt(context).pipe(model_details.model).pipe(output_parser);
    cluster_id_to_runnable[cluster_id] = summary_chain;
  }
  return RunnableMap.from(cluster_id_to_runnable);
}

export function get_cluster_dependency_sequence(
  root_cluster_id: string,
  cluster_graph: ClusterGraph
): { [sequence_index: number]: ClusterDependencies[] } {
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

function get_cluster_graph(clusters: ClusterMember[][], call_graph: CallGraph): ClusterGraph {
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
          ?.flatMap((call_ref) =>
            call_ref.resolutions.map((r) => symbol_to_cluster_id[r.symbol_id as string])
          )
          .filter((id): id is string => id !== undefined && id !== current_cluster_id) || []
      );

      for (const dependency_cluster_id of dependency_cluster_ids) {
        // Add to cluster_id_to_dependencies
        if (!cluster_id_to_dependencies[current_cluster_id]) {
          cluster_id_to_dependencies[current_cluster_id] = [];
        }
        cluster_id_to_dependencies[current_cluster_id].push(dependency_cluster_id);

        // Add to cluster_id_to_dependents
        if (!cluster_id_to_dependents[dependency_cluster_id]) {
          cluster_id_to_dependents[dependency_cluster_id] = [];
        }
        cluster_id_to_dependents[dependency_cluster_id].push(current_cluster_id);
      }
    }
  }

  // validate deps are symmetrical
  for (const [cluster_id, dependency_cluster_ids] of Object.entries(cluster_id_to_dependencies)) {
    for (const dependency_cluster_id of dependency_cluster_ids) {
      if (!cluster_id_to_dependents[dependency_cluster_id]?.includes(cluster_id)) {
        throw new Error(`Cluster dependencies are not symmetrical: ${cluster_id} depends on ${dependency_cluster_id}`);
      }
    }
  }

  return {
    cluster_id_to_members,
    cluster_id_to_child_cluster_ids: cluster_id_to_dependencies,
    cluster_id_to_parent_cluster_ids: cluster_id_to_dependents,
  };
}
