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
import { symbolRepoLocalName } from "../../shared/symbols";
import { ModelDetails } from "src/model";
import { CallGraph } from "@shared/codeGraph";

interface ClusterMember {
  symbol: string;
  functionSummaryString: string;
}

export async function getClusterDescriptions(
  clusters: ClusterMember[][],
  modelDetails: ModelDetails,
  domainSummary: string,
  callGraph: CallGraph
): Promise<Record<string, string>> {
  /**
   * TODO:
   * - give it the graph structure of the nodes in the cluster
   */
  const clusterGraph = getClusterGraph(clusters, callGraph);

  const depthLevels = computeDepthLevels(clusterGraph);

  const levelRunnables = Object.entries(depthLevels).map(([_, clustersAtLevel]) =>
    createLevelRunnable(clustersAtLevel, clusterGraph, modelDetails)
  );

  let sequence: Runnable;
  if (levelRunnables.length === 0) {
    throw new Error("No levels to process");
  } else {
    // Start with a RunnablePassthrough to pass the initial inputs through
    sequence = new RunnablePassthrough();
    for (const levelRunnable of levelRunnables) {
      // Pipe each levelRunnable, ensuring inputs are passed along
      sequence = sequence.pipe(
        RunnableParallel.from({
          curr: RunnableLambda.from((inputs: any) => {
            console.log(inputs);
            return levelRunnable.invoke({ ...inputs.curr, ...inputs.prev });
          }),
          prev: RunnableLambda.from((inputs: any) => ({ ...inputs.curr, ...inputs.prev })),
        })
      );
    }
  }

  const output = await sequence.invoke({ curr: { root: domainSummary }, prev: {} });
  const combinedSummaries = { ...output.curr, ...output.prev };
  const clusterSummaries = {};
  for (const clusterId in Object.keys(clusterGraph.clusterIdToMembers)) {
    clusterSummaries[clusterId] = combinedSummaries[clusterId];
  }
  return clusterSummaries;
}

interface ClusterContext {
  parentIds: string[] | undefined;
  clusterMembers: ClusterMember[];
}

function buildClusterSummaryPrompt(contextSummary: ClusterContext): PromptTemplate {
  // TODO: if it's root, make it link to the context in the summary. If not, make it differentiate from the parent description.
  const isRoot = !contextSummary.parentIds || contextSummary.parentIds.length === 0;
  let context: string;
  let inputVariables: string[];
  if (isRoot) {
    context = `These functions include the entrypoint into the application. 
    Connect their meaning to the following high-level domain context about the project:
    """
    {root}
    """`;
    inputVariables = ["root"];
  } else {
    context = `Here are the summaries of the modules that depend on this module.
    """
    ${contextSummary.parentIds.map((parentId) => "{" + parentId + "}").join("\n")}
    """
    Avoid repeating the same information in the parent descriptions. Instead, focus on what this module does differently or adds to the parent modules.`;
    inputVariables = contextSummary.parentIds;
  }
  const functionIdsPlaceholders = contextSummary.clusterMembers
    .map((member) => `${symbolRepoLocalName(member.symbol)}\n${member.functionSummaryString}`)
    .join("\n\n");
  const templateString = `Function descriptions:
"""
${functionIdsPlaceholders}
"""
${context}
Write a short, action-focused sentence about **what these functions collectively do** in telegraph-style, without mentioning specific classes, files, or organisational details`;
  console.log(templateString);
  return new PromptTemplate({
    inputVariables: inputVariables,
    template: templateString,
  });
}

function createLevelRunnable(
  clustersAtLevel: string[],
  clusterGraph: ClusterGraph,
  modelDetails: ModelDetails
): Runnable<any, any, RunnableConfig> {
  const clusterIdToRunnable: Record<string, Runnable<any, string, RunnableConfig>> = {};
  for (const clusterId of clustersAtLevel) {
    const context = {
      parentIds: clusterGraph.clusterIdToParentClusterIds[clusterId],
      clusterMembers: clusterGraph.clusterIdToMembers[clusterId],
    };
    const outputParser = new StringOutputParser();
    const summaryChain = buildClusterSummaryPrompt(context).pipe(modelDetails.model).pipe(outputParser);
    clusterIdToRunnable[clusterId] = summaryChain;
  }
  return RunnableMap.from(clusterIdToRunnable);
}

function computeDepthLevels(graph: ClusterGraph): Record<number, string[]> {
  const clusterIdToDepth: Record<string, number> = {};
  const depthToClusterIds: Map<number, string[]> = new Map();

  const visited = new Set<string>();

  // Find root clusters (clusters with no parents)
  const rootClusters = Object.keys(graph.clusterIdToMembers).filter((clusterId) => {
    const parents = graph.clusterIdToParentClusterIds[clusterId];
    return !parents || parents.length === 0;
  });

  // Perform BFS to assign depth levels
  const queue: { clusterId: string; depth: number }[] = rootClusters.map((clusterId) => ({
    clusterId,
    depth: 0,
  }));

  while (queue.length > 0) {
    const { clusterId, depth } = queue.shift()!;
    if (visited.has(clusterId)) continue;
    visited.add(clusterId);

    clusterIdToDepth[clusterId] = depth;

    if (!depthToClusterIds.has(depth)) {
      depthToClusterIds.set(depth, []);
    }
    depthToClusterIds.get(depth)!.push(clusterId);

    const childClusterIds = graph.clusterIdToChildClusterIds[clusterId];
    if (childClusterIds) {
      for (const childId of childClusterIds) {
        queue.push({ clusterId: childId, depth: depth + 1 });
      }
    }
  }

  // Check there is only 1 root cluster
  const depthClustersMap = Object.fromEntries(depthToClusterIds);
  if (!depthClustersMap[0] || depthClustersMap[0].length !== 1) {
    throw new Error(`Expected exactly one root cluster. ${depthClustersMap}`);
  }

  // Check we are not duplicating clusters at different levels
  const allClusters = Object.keys(graph.clusterIdToMembers);
  if (allClusters.length !== new Set(allClusters).size) {
    throw new Error("Duplicate clusters");
  }

  return depthClustersMap;
}

interface ClusterGraph {
  clusterIdToMembers: Record<string, ClusterMember[]>;
  clusterIdToParentClusterIds: Record<string, string[]>;
  clusterIdToChildClusterIds: Record<string, string[]>;
}

function getClusterGraph(clusters: ClusterMember[][], callGraph: CallGraph): ClusterGraph {
  const symbolToClusterId = {};
  for (const [index, cluster] of clusters.entries()) {
    for (const member of cluster) {
      symbolToClusterId[member.symbol] = `${index}`;
    }
  }

  const clusterIdToMembers = {};
  const clusterIdToDependencies: Record<string, string[]> = {}; // Clusters that the current cluster depends on
  const clusterIdToDependents: Record<string, string[]> = {}; // Clusters that depend on the current cluster

  for (const [index, cluster] of clusters.entries()) {
    const currentClusterId = `${index}`;
    clusterIdToMembers[currentClusterId] = cluster;

    for (const member of cluster) {
      const dependencyClusterIds = new Set(
        callGraph.definitionNodes[member.symbol]?.children
          ?.map((child) => symbolToClusterId[child.symbol])
          .filter((id) => id !== undefined && id !== currentClusterId) || []
      );

      for (const dependencyClusterId of dependencyClusterIds) {
        // Add to clusterIdToDependencies
        if (!clusterIdToDependencies[currentClusterId]) {
          clusterIdToDependencies[currentClusterId] = [];
        }
        clusterIdToDependencies[currentClusterId].push(dependencyClusterId);

        // Add to clusterIdToDependents
        if (!clusterIdToDependents[dependencyClusterId]) {
          clusterIdToDependents[dependencyClusterId] = [];
        }
        clusterIdToDependents[dependencyClusterId].push(currentClusterId);
      }
    }
  }

  // validate deps are symmetrical
  for (const [clusterId, dependencyClusterIds] of Object.entries(clusterIdToDependencies)) {
    for (const dependencyClusterId of dependencyClusterIds) {
      if (!clusterIdToDependents[dependencyClusterId]?.includes(clusterId)) {
        throw new Error(`Cluster dependencies are not symmetrical: ${clusterId} depends on ${dependencyClusterId}`);
      }
    }
  }

  return {
    clusterIdToMembers,
    clusterIdToChildClusterIds: clusterIdToDependencies,
    clusterIdToParentClusterIds: clusterIdToDependents,
  };
}
