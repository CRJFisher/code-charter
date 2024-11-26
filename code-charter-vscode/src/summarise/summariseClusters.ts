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

export interface ClusterGraph {
  clusterIdToMembers: Record<string, ClusterMember[]>;
  clusterIdToParentClusterIds: Record<string, string[]>;
  clusterIdToChildClusterIds: Record<string, string[]>;
}

interface ClusterDependencies {
  clusterId: string;
  dependencies: string[];
}

export async function getClusterDescriptions(
  clusters: ClusterMember[][],
  modelDetails: ModelDetails,
  domainSummary: string,
  callGraph: CallGraph
): Promise<Record<string, string>> {
  const clusterGraph = getClusterGraph(clusters, callGraph);

  const cluserSequence = getClusterDependencySequence("0", clusterGraph);
  const sequenceLength = Object.keys(cluserSequence).length;
  const levelRunnables = [];
  for (let i = 0; i < sequenceLength; i++) {
    levelRunnables.push(createLevelRunnable(cluserSequence[i], clusterGraph.clusterIdToMembers, modelDetails));
  }

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
            return levelRunnable.invoke({ ...inputs.prev, ...inputs.curr });
          }),
          prev: RunnableLambda.from((inputs: any) => ({ ...inputs.prev, ...inputs.curr })),
        })
      );
    }
  }

  const output = await sequence.invoke({ curr: { root: domainSummary }, prev: {} });
  const combinedSummaries = { ...output.prev, ...output.curr };
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
  return new PromptTemplate({
    inputVariables: inputVariables,
    template: templateString,
  });
}

function createLevelRunnable(
  clustersAtLevel: ClusterDependencies[],
  clusterIdToMembers: Record<string, ClusterMember[]>,
  modelDetails: ModelDetails
): Runnable<any, any, RunnableConfig> {
  const clusterIdToRunnable: Record<string, Runnable<any, string, RunnableConfig>> = {};
  for (const cluster of clustersAtLevel) {
    const clusterId = cluster.clusterId;
    const context = {
      parentIds: cluster.dependencies,
      clusterMembers: clusterIdToMembers[clusterId],
    };
    const outputParser = new StringOutputParser();
    const summaryChain = buildClusterSummaryPrompt(context).pipe(modelDetails.model).pipe(outputParser);
    clusterIdToRunnable[clusterId] = summaryChain;
  }
  return RunnableMap.from(clusterIdToRunnable);
}

export function getClusterDependencySequence(
  rootClusterId: string,
  clusterGraph: ClusterGraph
): { [sequenceIndex: number]: ClusterDependencies[] } {
  /**
   * If possible, we want the cluster to be processed after all it's dependencies have been processed.
   * If there a circular dependency in the graph, we need to process it (at least) twice - once with a restricted context (so the sequence can progreess) and then with the full context.
   * E.g. in A -> B -> C -> A, we can't include A in A's context in the first pass but we can once C has been processed.
   */
  const clusterSequence: { [sequenceIndex: number]: ClusterDependencies[] } = {};
  const clusterDepthLevels = getClusterDepthLevels(rootClusterId, clusterGraph);
  for (const [clusterId, depths] of Object.entries(clusterDepthLevels)) {
    for (const depth of depths) {
      if (!clusterSequence[depth]) {
        clusterSequence[depth] = [];
      }
      const clusterDependencies = new Set(clusterGraph.clusterIdToParentClusterIds[clusterId] || []);
      // Its dependencies have to have been processed before it
      const dependencies = Object.entries(clusterDepthLevels)
        .filter(
          ([clusterId, depths]) => clusterDependencies.has(clusterId) && Array.from(depths).some((d) => d < depth)
        )
        .map(([clusterId]) => clusterId);
      clusterSequence[depth].push({ clusterId, dependencies });
    }
  }
  return clusterSequence;
}

export function getClusterDepthLevels(
  startClusterId: string,
  clusterGraph: ClusterGraph,
  visitedNodes: Set<string> = new Set(),
  clusterIdDepthLevels: Record<string, Set<number>> = {},
  depth: number = 0
): Record<string, Set<number>> {
  if (clusterIdDepthLevels[startClusterId] === undefined) {
    clusterIdDepthLevels[startClusterId] = new Set();
  }
  clusterIdDepthLevels[startClusterId].add(depth);
  if (visitedNodes.has(startClusterId)) {
    return clusterIdDepthLevels;
  }
  visitedNodes.add(startClusterId);
  for (const child of clusterGraph.clusterIdToChildClusterIds[startClusterId] || []) {
    getClusterDepthLevels(child, clusterGraph, visitedNodes, clusterIdDepthLevels, depth + 1);
  }
  return clusterIdDepthLevels;
}

function rebuildClusterGraphBasedOnProcessingSequence(
  currentCluterGraph: ClusterGraph,
  processingSequence: string[][]
): ClusterGraph {
  const clusterIdToMembers = {};
  const clusterIdToChildClusterIds = {};
  const clusterIdToParentClusterIds = {};

  for (const [index, clusterIds] of processingSequence.entries()) {
    for (const clusterId of clusterIds) {
      clusterIdToMembers[clusterId] = currentCluterGraph.clusterIdToMembers[clusterId];
      clusterIdToChildClusterIds[clusterId] = currentCluterGraph.clusterIdToChildClusterIds[clusterId];
      clusterIdToParentClusterIds[clusterId] = currentCluterGraph.clusterIdToParentClusterIds[clusterId];
    }
  }

  return {
    clusterIdToMembers,
    clusterIdToChildClusterIds,
    clusterIdToParentClusterIds,
  };
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

  // TODO: remove duplicate cluster IDs
  return {
    clusterIdToMembers,
    clusterIdToChildClusterIds: clusterIdToDependencies,
    clusterIdToParentClusterIds: clusterIdToDependents,
  };
}
