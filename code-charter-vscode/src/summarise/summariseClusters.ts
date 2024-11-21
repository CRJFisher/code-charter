import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import {
  Runnable,
  RunnableConfig,
  RunnableLambda,
  RunnableLike,
  RunnableMap,
  RunnablePassthrough,
  RunnableSequence,
} from "@langchain/core/runnables";
import { symbolRepoLocalName } from "../../shared/symbols";
import { ModelDetails } from "src/model";
import { CallGraph } from "@shared/codeGraph";

interface ClusterMember {
  symbol: string;
  functionSummaryString: string;
}

// const outputParser = new StringOutputParser();
// const allClusterSummaryChains: {
//   [key: string]: Runnable<any, string, RunnableConfig>;
// } = {};

// const clusterIndexToDescriptions = {};
// for (const [index, cluster] of clusters.entries()) {
//   const clusterIndex = `${index}`;
// const summaryChain = buildClusterSummaryPrompt(clusterIndex).pipe(modelDetails.model).pipe(outputParser);
//   allClusterSummaryChains[clusterIndex] = summaryChain;
//   const clusterStrings = cluster.map(
//     (member) => `${symbolRepoLocalName(member.symbol)}\n${member.functionSummaryString}`
//   );
//   const clusterDescriptions = clusterStrings.join("------\n");
//   clusterIndexToDescriptions[clusterIndex] = clusterDescriptions;
// }

// try {
//   const refinedSummaries = await RunnableMap.from(allClusterSummaryChains).invoke(clusterIndexToDescriptions);
//   return Object.values(refinedSummaries);
// } catch (error) {
//   console.error("Error summarising cluster descriptions", error);
//   throw error;
// }
/**
 * TODO:
 * 1. give it the graph structure of the nodes in the cluster
 * 2. instead of the current domain summary, give it a summary of the parent contexts. This requires a BFS traversal of the cluster graph
 */

export async function getClusterDescriptions(
  clusters: ClusterMember[][],
  modelDetails: ModelDetails,
  domainSummary: string,
  callGraph: CallGraph
): Promise<Record<string, string>> {
  const clusterGraph = getClusterGraph(clusters, callGraph);
  // const levels = computeLevels(clusterGraph);
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
      sequence = sequence.pipe(levelRunnable).pipe(new RunnablePassthrough());
    }
  }
  const clusterSummaries = await sequence.invoke({ "0": domainSummary });

  return clusterSummaries;
}

interface ClusterContext {
  parentIds: string[];
  clusterMembers: ClusterMember[];
}

function buildClusterSummaryPrompt(
  clusterId: string,
  contextSummary: ClusterContext,
  isRoot: boolean = false
): PromptTemplate {
  // TODO: if it's root, make it link to the context in the summary. If not, make it differentiate from the parent description.
  return new PromptTemplate({
    inputVariables: [clusterId],
    template: `
              Some function descriptions:
              """
              {${clusterId}}
              """
              Some high-level domain context for the project:
              """
              ${contextSummary.parentIds.map((parentId) => "{" + parentId + "}").join("\n")}')}
              """
              Write a short, action-focused sentence about **what these functions collectively do** in telegraph-style, without mentioning specific classes, files, or organisational details.
              `,
  });
}

function createLevelRunnable(
  clustersAtLevel: string[],
  clusterGraph: ClusterGraph,
  modelDetails: ModelDetails
): Runnable<any, any, RunnableConfig> {
  const clusterRunnables = clustersAtLevel.map((clusterId) => {
    const parentIds = [...clusterGraph.clusterIdToParentClusterIds[clusterId]];

    const clusterMembers = clusterGraph.clusterIdToMembers[clusterId];

    const context = {
      parentIds,
      clusterMembers,
    };

    const outputParser = new StringOutputParser();
    const summaryChain = buildClusterSummaryPrompt(clusterId, context).pipe(modelDetails.model).pipe(outputParser);
    return summaryChain;
  });

  return RunnableMap.from(clusterRunnables);
}

function computeLevels(clusterGraph: ClusterGraph): string[][] {
  const clusterIdToLevel: Record<string, number> = {};
  const levels: string[][] = [];

  // Initialize clusters with no parents at level 0
  const level0Clusters = Object.keys(clusterGraph.clusterIdToMembers).filter((clusterId) => {
    const parents = clusterGraph.clusterIdToParentClusterIds[clusterId];
    return !parents || parents.size === 0;
  });

  levels.push(level0Clusters);
  level0Clusters.forEach((clusterId) => {
    clusterIdToLevel[clusterId] = 0;
  });

  let currentLevel = 1;
  let clustersAtCurrentLevel = level0Clusters;

  while (true) {
    const nextLevelClusters: string[] = [];

    clustersAtCurrentLevel.forEach((clusterId) => {
      const childClusters = clusterGraph.clusterIdToChildClusterIds[clusterId];
      if (childClusters) {
        childClusters.forEach((childClusterId) => {
          // Only process child clusters that haven't been assigned a level yet
          if (clusterIdToLevel[childClusterId] === undefined) {
            const parentIds = clusterGraph.clusterIdToParentClusterIds[childClusterId];
            // Check if all parents have been assigned levels
            const allParentsAssigned = Array.from(parentIds || []).every(
              (parentId) => clusterIdToLevel[parentId] !== undefined
            );

            if (allParentsAssigned) {
              clusterIdToLevel[childClusterId] = currentLevel;
              nextLevelClusters.push(childClusterId);
            }
          }
        });
      }
    });

    if (nextLevelClusters.length === 0) {
      break;
    }

    levels.push(nextLevelClusters);
    clustersAtCurrentLevel = nextLevelClusters;
    currentLevel++;
  }

  return levels;
}

function computeDepthLevels(graph: ClusterGraph): Record<number, string[]> {
  const clusterIdToDepth: Record<string, number> = {};
  const depthToClusterIds: Map<number, string[]> = new Map();

  const visited = new Set<string>();
  const stack: string[] = [];

  // Find root clusters (clusters with no parents)
  const rootClusters = Object.keys(graph.clusterIdToMembers).filter((clusterId) => {
    const parents = graph.clusterIdToParentClusterIds[clusterId];
    return !parents || parents.size === 0;
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

  return Object.fromEntries(depthToClusterIds);
}

interface ClusterGraph {
  clusterIdToMembers: Record<string, ClusterMember[]>;
  clusterIdToParentClusterIds: Record<string, Set<string>>;
  clusterIdToChildClusterIds: Record<string, Set<string>>;
}

function getClusterGraph(clusters: ClusterMember[][], callGraph: CallGraph): ClusterGraph {
  const symbolToClusterId = {};
  for (const [index, cluster] of clusters.entries()) {
    for (const member of cluster) {
      symbolToClusterId[member.symbol] = `${index}`;
    }
  }
  const clusterIdToMembers = {};
  const clusterIdToParentClusterIds = {};
  const clusterIdToChildClusterIds = {};
  for (const [index, cluster] of clusters.entries()) {
    const parentClusterId = `${index}`;
    clusterIdToMembers[parentClusterId] = cluster;
    for (const member of cluster) {
      const memberChildSymbols = callGraph.definitionNodes[member.symbol].children.map((child) => child.symbol);
      for (const symbol of memberChildSymbols) {
        if (!symbolToClusterId[symbol] || symbolToClusterId[symbol] === parentClusterId) {
          continue;
        }
        const childClusterId = symbolToClusterId[symbol];

        // child->parent
        if (!clusterIdToParentClusterIds[childClusterId]) {
          clusterIdToParentClusterIds[childClusterId] = new Set();
        }
        clusterIdToParentClusterIds[childClusterId].add(parentClusterId);

        // parent->child
        if (!clusterIdToChildClusterIds[parentClusterId]) {
          clusterIdToChildClusterIds[parentClusterId] = new Set();
        }
        clusterIdToChildClusterIds[parentClusterId].add(childClusterId);
      }
    }
  }
  return { clusterIdToMembers, clusterIdToParentClusterIds, clusterIdToChildClusterIds };
}
