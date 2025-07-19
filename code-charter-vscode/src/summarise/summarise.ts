import * as vscode from "vscode";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { Runnable, RunnableMap, RunnableConfig } from "@langchain/core/runnables";
import { TreeAndContextSummaries, CallGraph } from "@shared/codeGraph";
import { CallGraphNode } from "refscope";
import PouchDB from "pouchdb";
import { hashText } from "../hashing";
import { symbolRepoLocalName } from "../../shared/symbols";
import { ModelDetails } from "src/model";
import { parseMarkdownTopSection } from "./domainContext";
import { getSummaryWithCachingChain, SummaryRecord } from "./caching";

interface RefinedSummariesAndFilteredOutNodes {
  refinedFunctionSummaries: Record<string, string>;
  filteredOutNodes: string[];
  filteredCallTree: Record<string, CallGraphNode>;
}

async function summariseCallGraph(
  topLevelFunctionSymbol: string,
  callGraph: CallGraph,
  workDir: vscode.Uri,
  workspacePath: vscode.Uri,
  modelDetails: ModelDetails
): Promise<TreeAndContextSummaries> {
  console.log(modelDetails);

  const topLevelFunctionName = symbolRepoLocalName(topLevelFunctionSymbol);
  const rootContext = await summariseRootScope(workDir, workspacePath, topLevelFunctionName, modelDetails);

  const definitionNodes = getAllDefinitionNodesFromCallGraph(callGraph, topLevelFunctionSymbol);

  const functionSymbolCode: Map<string, string> = await getSymbolToFunctionCode(definitionNodes, workspacePath);

  const functionDescriptions = await getFunctionProcessingSteps(
    workDir,
    functionSymbolCode,
    definitionNodes,
    modelDetails
  );

  const businessLogicDescriptions = await getFunctionBusinessLogic(
    workDir,
    functionDescriptions,
    definitionNodes,
    modelDetails,
    rootContext,
    topLevelFunctionSymbol,
    callGraph
  );

  const summaries = {
    functionSummaries: Object.fromEntries(functionDescriptions),
    refinedFunctionSummaries: businessLogicDescriptions.refinedFunctionSummaries,
    contextSummary: rootContext,
    callTreeWithFilteredOutNodes: businessLogicDescriptions.filteredCallTree,
  };
  // write summaries to file
  // const outFile = `${workDir.fsPath}/summaries-${topLevelFunctionName.replace(" ", "")}.json`;
  // await vscode.workspace.fs.writeFile(vscode.Uri.file(outFile), Buffer.from(JSON.stringify(summaries, null, 2)));
  return summaries;
}

async function summariseRootScope(
  workDir: vscode.Uri,
  workspacePath: vscode.Uri,
  topLevelFunctionName: string,
  modelDetails: ModelDetails
): Promise<string> {
  const db = new PouchDB<SummaryRecord>(`${workDir.fsPath}/rootScopeSummary`);

  const markdown = await checkForMarkdownFile(workspacePath);
  let projectText = "";
  if (markdown) {
    projectText = parseMarkdownTopSection(markdown);
  } else {
    projectText = "No markdown file found - please derive intentions from function path";
  }

  const rootScopeSummaryKey = hashText(modelDetails.uid, projectText);
  const cachedSummary = await db.get(rootScopeSummaryKey).catch((_) => null);
  if (cachedSummary) {
    return cachedSummary.summary;
  }
  const rootContextPrompt = new PromptTemplate({
    inputVariables: ["projectText", "functionPath"],
    template: `Please detect the domain of the project and describe the likely intentions of the top-level function in this project.
        Output the sections: "Domain:", "Keywords:" and "Top-level intentions".
        Project description:
        """
        {projectText}
        """
        Function Path:
        """
        {functionPath}
        """`,
  });
  const rootContextSummaryChain = rootContextPrompt.pipe(modelDetails.model).pipe(new StringOutputParser());
  const rootContext = await rootContextSummaryChain.invoke({
    projectText,
    functionPath: topLevelFunctionName,
  });

  db.put({
    _id: rootScopeSummaryKey,
    summary: rootContext,
    symbol: "",
    createdAt: new Date(),
  });
  return rootContext;
}

function getAllDefinitionNodesFromCallGraph(
  graph: CallGraph,
  topLevelFunctionSymbol: string
): Map<string, CallGraphNode> {
  const allFunctionNodes: Map<string, CallGraphNode> = new Map();
  const startNode = graph.nodes.get(topLevelFunctionSymbol);
  if (!startNode) return allFunctionNodes;
  const queue: CallGraphNode[] = [startNode];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (!allFunctionNodes.has(node.symbol)) {
      allFunctionNodes.set(node.symbol, node);
      node.calls.forEach((child) => {
        const childNode = graph.nodes.get(child.symbol);
        if (childNode) {
          queue.push(childNode);
        }
      });
    }
  }
  return allFunctionNodes;
}

async function getFunctionProcessingSteps(
  workDir: vscode.Uri,
  functionCode: Map<string, string>,
  allFunctionNodes: Map<string, CallGraphNode>,
  modelDetails: ModelDetails
): Promise<Map<string, string>> {
  function buildProcessingStepsPrompt(symbol: string) {
    return new PromptTemplate({
      inputVariables: [symbol],
      template: `Describe the semantically-grouped lines of code i.e. processing steps of the function below. Output a short, telegram-style line of text for each processing step.
            E.g. "- Parse the input data"
            """
            {${symbol}}
            """`,
    });
  }

  const functionSummariesDb = new PouchDB<SummaryRecord>(
    `${workDir.fsPath}/functionProcessingSteps-${modelDetails.uid}`
  );

  const outputParser = new StringOutputParser();

  const allFunctionSummaryChains: {
    [key: string]: Runnable<any, string, RunnableConfig>;
  } = {};
  for (const [symbol, _] of allFunctionNodes) {
    const code = functionCode.get(symbol);
    if (!code) {
      throw new Error(`Code not found for symbol ${symbol}`);
    }
    const summaryKey = hashText(symbol, code);
    const summaryChain = buildProcessingStepsPrompt(symbol).pipe(modelDetails.model).pipe(outputParser);
    const summaryFromCacheOrLLMChain = await getSummaryWithCachingChain(
      summaryChain,
      functionSummariesDb,
      summaryKey,
      symbol
    );
    allFunctionSummaryChains[symbol] = summaryFromCacheOrLLMChain;
  }

  try {
    const summaries = await RunnableMap.from(allFunctionSummaryChains).invoke(Object.fromEntries(functionCode));
    return new Map(Object.entries(summaries));
  } catch (error) {
    console.error("Error summarising functions:", error);
    throw error;
  }
}

async function getFunctionBusinessLogic(
  workDir: vscode.Uri,
  summaries: Map<string, string>,
  allFunctionNodes: Map<string, CallGraphNode>,
  modelDetails: ModelDetails,
  domainSummary: string,
  topLevelFunctionSymbol: string,
  callGraph: CallGraph
): Promise<RefinedSummariesAndFilteredOutNodes> {
  function buildBusinessLogicPrompt(symbol: string) {
    return new PromptTemplate({
      inputVariables: [symbol],
      template: `I really need to translate the processing steps below and distil them to business logic descriptions.
            Business logic should be terms that a non-technical, yet domain-knowledgeable person would understand.
            Here is a summary of the domain: 
            """
            ${domainSummary}
            """
            Business logic should be terms in the realm of the domain and should focus on the "happy" path.
            If all the processing steps are technical implementation details, output "- None".
            The original processing steps can be filtered out, merged or rephrased. The goal is to write the minimum steps that capture the essence of the function.
            Implementation steps should be removed e.g. initialization, error handling, and debug logging.
            The processing steps for the "${symbol}" function are:
            """
            {${symbol}}
            """
            Only return the filtered, transformed steps in concise, telegraph-style bullet points. E.g. "- Get the user's email address"
            `,
    });
  }

  const functionSummariesDb = new PouchDB<SummaryRecord>(`${workDir.fsPath}/functionBusinessLogic-${modelDetails.uid}`);

  const outputParser = new StringOutputParser();
  const allFunctionSummaryChains: {
    [key: string]: Runnable<any, string, RunnableConfig>;
  } = {};
  for (const [_, node] of allFunctionNodes) {
    const summaryChain = buildBusinessLogicPrompt(node.symbol).pipe(modelDetails.model).pipe(outputParser);
    const summaryKey = hashText(node.symbol);
    const summaryFromCacheOrLLMChain = await getSummaryWithCachingChain(
      summaryChain,
      functionSummariesDb,
      summaryKey,
      node.symbol
    );
    allFunctionSummaryChains[node.symbol] = summaryFromCacheOrLLMChain;
  }

  try {
    const refinedSummaries = await RunnableMap.from(allFunctionSummaryChains).invoke(Object.fromEntries(summaries));
    const filteredOutNodes = Object.entries(refinedSummaries)
      .filter(([_, summary]) => summary.includes("- None"))
      .map(([symbol, _]) => symbol);
    const filteredCallTree = getCallGraphItemsWithFilteredOutFunctions(
      topLevelFunctionSymbol,
      filteredOutNodes,
      callGraph
    );
    const filteredFunctionSummaries = Object.fromEntries(
      Object.entries(refinedSummaries).filter(([symbol, _]) => !!filteredCallTree[symbol])
    );
    return {
      refinedFunctionSummaries: filteredFunctionSummaries,
      filteredOutNodes,
      filteredCallTree,
    };
  } catch (error) {
    console.error("Error summarising business logic", error);
    throw error;
  }
}

async function getSymbolToFunctionCode(
  allFunctionNodes: Map<string, CallGraphNode>,
  workspacePath: vscode.Uri
): Promise<Map<string, string>> {
  const nodeCode: Map<string, string> = new Map();
  await Promise.all(
    Array.from(allFunctionNodes.values()).map(async (n) => {
      const filePath = `${workspacePath.fsPath}/${n.definition.file_path}`;
      const code = await vscode.workspace.fs
        .readFile(vscode.Uri.file(filePath))
        .then((buffer) => new TextDecoder().decode(buffer));
      const codeLines = code.split("\n");
      const functionLines = codeLines.slice(n.definition.range.start.row, n.definition.range.end.row);
      nodeCode.set(n.symbol, functionLines.join("\n"));
    })
  );
  return nodeCode;
}

async function readCallGraphJsonFile(callGraphFile: vscode.Uri): Promise<CallGraph> {
  // Read the JSON file
  const jsonString = await vscode.workspace.fs
    .readFile(callGraphFile)
    .then((buffer) => new TextDecoder().decode(buffer));
  const jsonParsed = JSON.parse(jsonString);
  return jsonParsed as CallGraph;
}

async function checkForMarkdownFile(directoryPath: vscode.Uri): Promise<string | null> {
  try {
    // Read all files in the directory asynchronously
    const files = await vscode.workspace.fs.readDirectory(directoryPath);
    // Iterate over each file, check its lowercase form
    for (const [fileName, fileType] of files) {
      if (fileName.toLowerCase() === "readme.md") {
        // If a match is found, return the file text
        return await vscode.workspace.fs
          .readFile(vscode.Uri.joinPath(directoryPath, fileName))
          .then((buffer) => new TextDecoder().decode(buffer));
      }
    }
  } catch (error) {
    console.error("Failed to read the directory:", error);
    return null;
  }
  // Return null if no matching file is found
  return null;
}

function getCallGraphItemsWithFilteredOutFunctions(
  topLevelFunctionSymbol: string,
  filteredOutNodes: string[],
  callGraph: CallGraph
): Record<string, CallGraphNode> {
  function copyDefNodeWitoutFilteredOutRefs(node: CallGraphNode): CallGraphNode {
    const newChildren = node.calls.filter((child) => !filteredOutNodes.includes(child.symbol));
    return {
      ...node,
      calls: newChildren,
    };
  }
  const visitedNodes = new Set<string>();
  const callGraphItems: Record<string, CallGraphNode> = {};
  const startNode = callGraph.nodes.get(topLevelFunctionSymbol);
  if (!startNode) return callGraphItems;
  const queue: CallGraphNode[] = [copyDefNodeWitoutFilteredOutRefs(startNode)];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (!filteredOutNodes.includes(node.symbol) && !visitedNodes.has(node.symbol)) {
      callGraphItems[node.symbol] = node;
      node.calls.forEach((child) => {
        const childNode = callGraph.nodes.get(child.symbol);
        if (childNode) {
          queue.push(copyDefNodeWitoutFilteredOutRefs(childNode));
        }
      });
      visitedNodes.add(node.symbol);
    }
  }
  return callGraphItems;
}

export { summariseCallGraph, readCallGraphJsonFile };
