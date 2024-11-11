import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { Runnable, RunnableConfig, RunnableMap } from "@langchain/core/runnables";
import { symbolRepoLocalName } from "../../shared/symbols";
import { ModelDetails } from "src/model";

interface ClusterMember {
  symbol: string;
  functionString: string;
}

export async function getClusterDescriptions(
  clusters: ClusterMember[][],
  modelDetails: ModelDetails,
  domainSummary: string
): Promise<string[]> {
  function buildClusterSummaryPrompt(clusterId: string) {
    return new PromptTemplate({
      inputVariables: [clusterId],
      template: `The goal is to express the core purpose and intent of the group in concise, domain-relevant language.
                Please use the appropriate terminology from this domain to describe the cluster. Here is some domain context:
                """
                ${domainSummary}
                """
                Focus on capturing a high-level view suitable for someone with domain knowledge but without technical expertise.
                Here are the function descriptions for this cluster:
                """
                {${clusterId}}
                """
                Distill the central theme of these functions into into a single, short sentence in telegraph-style.
                `,
    });
  }

  const outputParser = new StringOutputParser();
  const allClusterSummaryChains: {
    [key: string]: Runnable<any, string, RunnableConfig>;
  } = {};

  const clusterIndexToDescriptions = {};
  for (const [index, cluster] of clusters.entries()) {
    const clusterIndex = `${index}`;
    const summaryChain = buildClusterSummaryPrompt(clusterIndex).pipe(modelDetails.model).pipe(outputParser);
    allClusterSummaryChains[clusterIndex] = summaryChain;
    const clusterStrings = cluster.map((member) => `${symbolRepoLocalName(member.symbol)}\n${member.functionString}`);
    const clusterDescriptions = clusterStrings.join("------\n");
    clusterIndexToDescriptions[clusterIndex] = clusterDescriptions;
  }

  try {
    const refinedSummaries = await RunnableMap.from(allClusterSummaryChains).invoke(clusterIndexToDescriptions);
    return Object.values(refinedSummaries);
  } catch (error) {
    console.error("Error summarising cluster descriptions", error);
    throw error;
  }
}
