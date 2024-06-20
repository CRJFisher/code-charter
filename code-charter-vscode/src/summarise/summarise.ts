import { plainToInstance } from "class-transformer";
import * as fs from "fs";
import * as fsProm from 'fs/promises';
import * as vscode from 'vscode';
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { Runnable, RunnableMap, RunnableConfig, RunnableBranch, RunnableLambda } from "@langchain/core/runnables";
import { TreeAndContextSummaries, symbolRepoLocalName } from "./models";
import PouchDB from "pouchdb";
import { CallGraph, DefinitionNode } from '../models/callGraph';
import { hashText } from "../hashing";

interface SummaryRecord {
    _id: string;
    symbol: string;
    summary: string;
    createdAt: Date;
}

// Output a map and a string
async function summariseCallGraph(topLevelFunctionSymbol: string, callGraph: CallGraph, workDir: vscode.Uri, workspacePath: vscode.Uri,): Promise<TreeAndContextSummaries> {
    // TODO: use vscode LLM API in chain when available

    const topLevelFunctionName = symbolRepoLocalName(topLevelFunctionSymbol);

    const rootContext = await summariseRootScope(workDir, workspacePath, topLevelFunctionName);

    const definitionNodes = getAllDefinitionNodesFromCallGraph(callGraph, topLevelFunctionSymbol);

    const functionSymbolCode: Map<string, string> = await getSymbolToFunctionCode(definitionNodes, workspacePath);

    const functionSummaries = await getFunctionSummaries(workDir, functionSymbolCode, definitionNodes);

    // TODO: Classify the control flow of the functions (e.g. if-else, loops)
    // TODO: Identify functions which don't have any meaningful business logic and so can be ignored/grouped with the parent in the diagram
    //  - is logging an implementation detail or business logic? It depends on the purpses of the logs - if they are for debugging, they are implementation details, if they are the main output, it's business logic   
    // TODO: incorporate the control flow into the re-summarisation

    const refinedFunctionSummaries = await refineSummaries(workDir, functionSummaries, definitionNodes);

    // (For debugging) write summaries to file
    const outFile = `${workDir.fsPath}/summaries-${topLevelFunctionName.replace(' ', '')}.json`;
    console.log(`Writing summaries to ${outFile}`);
    await fsProm.writeFile(outFile, JSON.stringify(Object.fromEntries(refinedFunctionSummaries), null, 2));

    const summaries = new TreeAndContextSummaries(functionSummaries, refinedFunctionSummaries, rootContext);
    return summaries;
}

async function summariseRootScope(workDir: vscode.Uri, workspacePath: vscode.Uri, topLevelFunctionName: string) {
    const db = new PouchDB<SummaryRecord>(`${workDir.fsPath}/rootScopeSummary`);

    const rootContextModelName = 'gpt-3.5-turbo';

    const markdown = await checkForMarkdownFile(workspacePath);
    let projectText = "";
    if (markdown) {
        projectText = parseMarkdownTopSection(markdown);
    } else {
        projectText = "No markdown file found - please derive intentions from function path";
    }

    const rootScopeSummaryKey = hashText(rootContextModelName, projectText);
    const cachedSummary = await db.get(rootScopeSummaryKey).catch((_) => null);
    if (cachedSummary) {
        return cachedSummary.summary;
    }

    const rootContextPrompt = new PromptTemplate({
        inputVariables: ["projectText", "functionPath"],
        template: `Please describe the user intention from the Project Description and the entrypoint Function Path they are interacting with. Output a single, plaintext sentence.
        Project description:
        """
        {projectText}
        """
        Function Path:
        """
        {functionPath}
        """`,
    });
    const model = new ChatOpenAI({ temperature: 0, modelName: rootContextModelName });
    const rootContextSummaryChain = rootContextPrompt.pipe(model).pipe(new StringOutputParser());
    const rootContext = await rootContextSummaryChain.invoke({ projectText, functionPath: topLevelFunctionName });

    db.put({
        _id: rootScopeSummaryKey,
        summary: rootContext,
        symbol: "",
        createdAt: new Date(),
    });
    return rootContext;
}

function getAllDefinitionNodesFromCallGraph(graph: CallGraph, topLevelFunctionSymbol: string): Map<string, DefinitionNode> {
    const allFunctionNodes: Map<string, DefinitionNode> = new Map();
    const queue: DefinitionNode[] = [graph.definitionNodes[topLevelFunctionSymbol]];
    while (queue.length > 0) {
        const node = queue.shift()!;
        if (!allFunctionNodes.has(node.symbol)) {
            allFunctionNodes.set(node.symbol, node);
            node.children.forEach(child => {
                queue.push(graph.definitionNodes[child.symbol]);
            });
        }
    }
    return allFunctionNodes;
}

async function getFunctionSummaries(workDir: vscode.Uri, functionCode: Map<string, string>, allFunctionNodes: Map<string, DefinitionNode>): Promise<Map<string, string>> {
    function buildPrompt(symbol: string) {
        return new PromptTemplate({
            inputVariables: [symbol],
            template: `Describe the below code flow concisely, focusing on business logic and related, relevant control flow. Avoid framing language. Directly describe the function's purpose and interactions, e.g., 'Calculates total price with tax.', keeping to a single, plaintext sentence.
    """
    {${symbol}}
    """`,
        });
    }

    const summaryModelName = 'gpt-3.5-turbo';
    const functionSummariesDb = new PouchDB<SummaryRecord>(`${workDir.fsPath}/functionSummaries-${summaryModelName}`);

    const model = new ChatOpenAI({ temperature: 0, modelName: summaryModelName });

    const outputParser = new StringOutputParser();

    const allFunctionSummaryChains: { [key: string]: Runnable<any, string, RunnableConfig> } = {};
    for (const [symbol, _] of allFunctionNodes) {
        const code = functionCode.get(symbol);
        if (!code) {
            throw new Error(`Code not found for symbol ${symbol}`);
        }
        const summaryKey = hashText(symbol, code);
        const summaryChain = buildPrompt(symbol).pipe(model).pipe(outputParser);
        const summaryFromCacheOrLLMChain = await getSummaryWithCachingChain(summaryChain, functionSummariesDb, summaryKey, symbol);
        allFunctionSummaryChains[symbol] = summaryFromCacheOrLLMChain;
    }

    const summaries = await RunnableMap.from(allFunctionSummaryChains).invoke(Object.fromEntries(functionCode));

    return new Map(Object.entries(summaries));
}

async function getSummaryWithCachingChain(summaryChain: Runnable<any, string, RunnableConfig>, functionSummariesDb: PouchDB.Database<SummaryRecord>, summaryKey: string, symbol: string) {
    const summaryWithCacheChain = summaryChain.pipe(RunnableLambda.from(async (summary: string) => {
        await functionSummariesDb.put({
            _id: summaryKey,
            summary: summary,
            symbol: symbol,
            createdAt: new Date(),
        });
        await functionSummariesDb.allDocs().then((r) => {
            return console.log(r);
        });
        return summary;
    }));
    const cachedSummary = await functionSummariesDb.get(summaryKey).then((record) => record.summary).catch((err) => {
        if (err.status !== 404) {
            console.log(`Failed to get cached summary for ${symbol}: ${err}`);
        }
        return null;
    });
    const summaryFromCacheOrLLMChain = RunnableBranch.from([
        [
            (_) => !!cachedSummary,
            RunnableLambda.from((_) => {
                console.log(`Using cached summary for ${symbol}`);
                return cachedSummary!;
            }),
        ],
        summaryWithCacheChain,
    ]);
    return summaryFromCacheOrLLMChain;
}

async function getSymbolToFunctionCode(allFunctionNodes: Map<string, DefinitionNode>, workspacePath: vscode.Uri): Promise<Map<string, string>> {
    const nodeCode: Map<string, string> = new Map();
    await Promise.all(Array.from(allFunctionNodes.values()).map(async (n) => {
        const filePath = `${workspacePath.fsPath}/${n.document}`;
        const code = await fs
            .promises
            .readFile(filePath, 'utf8');
        const codeLines = code.split('\n');
        const functionLines = codeLines.slice(n.enclosingRange.startLine, n.enclosingRange.endLine);
        nodeCode.set(n.symbol, functionLines.join('\n'));
    }));
    return nodeCode;
}

async function refineSummaries(workDir: vscode.Uri, summaries: Map<string, string>, allFunctionNodes: Map<string, DefinitionNode>): Promise<Map<string, string>> {
    // Re-summarise each parent function summary by including the child summaries

    function buildPrompt(parentSymbol: string, childSymbols: string[]) {
        const childSummaryTemplates = childSymbols.map((childSymbol) => `{${childSymbol}}`).join("\n");
        return new PromptTemplate({
            inputVariables: [parentSymbol, ...childSymbols],
            template: `Below is a parent function description and the descriptions of the child functions called inside it. Output just a refined parent function description based on the child function descriptions, providing a higher-level description for the parent including the key business logic control flow. Output a single, plaintext sentence.
            """
    {${parentSymbol}}
    """
    Child function summaries:    """
    ${childSummaryTemplates}
    """`,
        });
    }

    const refineModelName = 'gpt-3.5-turbo';
    const refinedFunctionSummariesDb = new PouchDB<SummaryRecord>(`${workDir.fsPath}/refinedFunctionSummaries-${refineModelName}`);

    const model = new ChatOpenAI({ temperature: 0, modelName: refineModelName });

    const outputParser = new StringOutputParser();
    const allFunctionSummaryChains: { [key: string]: Runnable<any, string, RunnableConfig> } = {};
    for (const [_, node] of allFunctionNodes) {
        const childSymbols = node.children.map(child => child.symbol);
        const summaryChain = buildPrompt(node.symbol, childSymbols).pipe(model).pipe(outputParser);
        const allSummaries = [summaries.get(node.symbol), ...childSymbols.map(childSymbol => summaries.get(childSymbol))];
        const summaryKey = hashText(node.symbol, allSummaries.join(''));
        const summaryFromCacheOrLLMChain = await getSummaryWithCachingChain(summaryChain, refinedFunctionSummariesDb, summaryKey, node.symbol);
        allFunctionSummaryChains[node.symbol] = summaryFromCacheOrLLMChain;
    }

    const refinedSummaries = await RunnableMap.from(allFunctionSummaryChains).invoke(Object.fromEntries(summaries));

    return new Map(Object.entries(refinedSummaries));
}

async function readCallGraphJsonFile(callGraphFile: vscode.Uri): Promise<CallGraph> {
    // Read the JSON file
    const jsonString = await fs.promises.readFile(callGraphFile.fsPath, 'utf8');
    // Ensure the JSON is parsed into an array and then deserialized into CallGraphNode instances
    const jsonParsed = JSON.parse(jsonString);
    return plainToInstance(CallGraph, jsonParsed);
}

function countNodes(topLevelNode: string, graph: CallGraph, visitedNodes: Set<string> = new Set<string>()): number {
    return graph.definitionNodes[topLevelNode].children.reduce((acc, child) => {
        if (visitedNodes.has(child.symbol)) {
            return acc;
        }
        visitedNodes.add(child.symbol);
        return acc + countNodes(child.symbol, graph, visitedNodes);
    }, 1);
}

async function checkForMarkdownFile(directoryPath: vscode.Uri): Promise<string | null> {
    try {
        // Read all files in the directory asynchronously
        const files = await fs.promises.readdir(directoryPath.fsPath);
        // Iterate over each file, check its lowercase form
        for (const file of files) {
            if (file.toLowerCase() === "readme.md") {
                // If a match is found, return the file text
                return await fs.promises.readFile(`${directoryPath.fsPath}/${file}`, 'utf8');
            }
        }
    } catch (error) {
        console.error("Failed to read the directory:", error);
        return null;
    }
    // Return null if no matching file is found
    return null;
}


function parseMarkdownTopSection(markdownText: string): string {
    // Regex to match everything from the start of the text to the first occurrence of a line starting with ##
    const regex = /^.*?(?=^\s*##)/s;

    // Executing the regex
    const matches = regex.exec(markdownText);

    // Return the matched text or an empty string if no match is found
    return matches ? matches[0] : '';
}

export { summariseCallGraph, readCallGraphJsonFile, countNodes };
