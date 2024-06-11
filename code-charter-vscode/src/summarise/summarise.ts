import { plainToInstance } from "class-transformer";
import * as fs from "fs";
import * as fsProm from 'fs/promises';
import * as vscode from 'vscode';
import { ChatOpenAI } from "@langchain/openai";
// import { ChatAnthropic } from "@langchain/anthropic";
// import { VertexAI } from "@langchain/google-vertexai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { Runnable, RunnableMap, RunnableSequence, RunnableLambda, RunnableConfig, RunnablePassthrough } from "@langchain/core/runnables";
import { TreeAndContextSummaries, CallGraph, DefinitionNode, symbolRepoLocalName } from "./models";


// const safety = [
//     { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
//     { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
//     { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
//     { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
// ];
// const model = new VertexAI({ temperature: 0, safetySettings: safety, model: 'gemini-1.5-flash-001' });

// Output a map and a string
async function summariseCallGraph(topLevelFunction: string, callGraph: CallGraph, workDir: vscode.Uri, workspacePath: vscode.Uri,): Promise<TreeAndContextSummaries> {
    // TODO: use vscode LLM API in chain when available
    // const model = new ChatOpenAI({ temperature: 0, modelName: 'gpt-4o' });

    const markdown = await checkForMarkdownFile(workspacePath);
    let projectText = "";
    if (markdown) {
        projectText = parseMarkdownTopSection(markdown);
    } else {
        projectText = "No markdown file found - please derive intentions from function path";
    }
    const rootContextPrompt = new PromptTemplate({
        inputVariables: ["projectText", "functionPath"],
        template: `Please carefully interperet the following, deriving from the high level use cases from the *project description* and the specific intentions served by the *function path*
        *project description*:
        """
        {projectText}
        """
        *function path*:
        """
        {functionPath}
        """
        Only output the summary text with no framing text, keeping it to the minimum possible length.`,
    });
    const rootContextModelName = 'gpt-3.5-turbo';
    const model = new ChatOpenAI({ temperature: 0, modelName: rootContextModelName });
    const rootContextSummaryChain = rootContextPrompt.pipe(model).pipe(new StringOutputParser());
    const topLevelFunctionName = symbolRepoLocalName(topLevelFunction);
    const rootContext = await rootContextSummaryChain.invoke({ projectText, functionPath: topLevelFunctionName });
    fs.writeFile(`${workDir.fsPath}/rootContext_${rootContextModelName}.json`, JSON.stringify({ "rootContext": rootContext }), 'utf8', (err) => { });

    try {
        // const chain = await processTree(callGraphNode, "rootContext", workspacePath, model);
        // const callGraphSummaries: { [key: string]: string } = await chain.invoke({ rootContext: rootContext });
        // TODO: implement caching based on a hash of the function string
        const functionSummaries = await summariseIndividualFunctions(topLevelFunction, callGraph, workspacePath, workDir);
        const functionSummariesObject = Object.fromEntries(functionSummaries);


        // TODO: Use GPT-3.5 to classify the control flow of the functions (e.g. if-else, loops)
        // TODO: Use GPT-3.5 to identify functions which don't have any meaningful business logic and so can be ignored/grouped with the parent in the diagram
        //  - is logging an implementation detail or business logic? It depends on the purpses of the logs - if they are for debugging, they are implementation details, if they are the main output, it's business logic   
        // TODO: incorporate the control flow into the re-summarisation
        const refinedFunctionSummaries = await refineSummaries(topLevelFunction, callGraph, functionSummariesObject, workDir);

        // Write summaries to file
        const outFile = `${workDir.fsPath}/summaries-${topLevelFunctionName.replace(' ', '')}.json`;
        console.log(`Writing summaries to ${outFile}`);
        await fsProm.writeFile(outFile, JSON.stringify(Object.fromEntries(refinedFunctionSummaries), null, 2));
        return new TreeAndContextSummaries(functionSummaries, refinedFunctionSummaries, rootContext);
    } catch (error) {
        console.error("Failed to summarise call graph:", callGraph);
        throw error;
    }
}

async function summariseIndividualFunctions(topLevelFunction: string, graph: CallGraph, workspacePath: vscode.Uri, workDir: vscode.Uri): Promise<Map<string, string>> {
    function buildPrompt(symbol: string) {
        return new PromptTemplate({
            inputVariables: [symbol],
            template: `Summarise the below code concisely, focusing on business logic. Avoid framing language. Directly describe the function's purpose and interactions, e.g., 'Calculates total price with tax.', keeping to a single, plaintext sentence.
    """
    {${symbol}}
    """`,
        });
    }

    // Get all the distinct functions (nodes) in the call graph
    const allFunctionNodes = new Map<string, DefinitionNode>();
    const allFunctionSummaryChains: { [key: string]: Runnable<any, string, RunnableConfig> } = {};
    const summaryModelName = 'gpt-3.5-turbo';
    const model = new ChatOpenAI({ temperature: 0, modelName: summaryModelName });

    const outputParser = new StringOutputParser();

    const queue: DefinitionNode[] = [graph.definitionNodes[topLevelFunction]];
    while (queue.length > 0) {
        const node = queue.shift()!;
        if (!allFunctionNodes.has(node.symbol)) {
            allFunctionNodes.set(node.symbol, node);
            const chain = buildPrompt(node.symbol).pipe(model).pipe(outputParser);
            allFunctionSummaryChains[node.symbol] = chain;
            node.children.forEach(child => {
                queue.push(graph.definitionNodes[child.symbol]);
            });
        }
    }

    // Get all the code for the nodes
    const nodeCode: { [key: string]: string } = {};
    await Promise.all(Array.from(allFunctionNodes.values()).map(async (n) => {
        const filePath = `${workspacePath.fsPath}/${n.document}`;
        const code = await fs
            .promises
            .readFile(filePath, 'utf8');
        const codeLines = code.split('\n');
        const functionLines = codeLines.slice(n.enclosingRange.startLine, n.enclosingRange.endLine);
        nodeCode[n.symbol] = functionLines.join('\n');
    }));

    const summaries = await RunnableMap.from(allFunctionSummaryChains).invoke(nodeCode);
    const summariesFile = `${workDir.fsPath}/callGraphSummaries_${summaryModelName}.json`;
    console.log(`Writing summaries to ${summariesFile}`);
    // store callGraphSummaries as a json file
    fs.writeFile(summariesFile, JSON.stringify(summaries), 'utf8', (err) => {
        if (err) {
            console.error(err);
            return;
        }
    });
    return new Map(Object.entries(summaries));
}

async function refineSummaries(topLevelFunction: string, graph: CallGraph, summaries: { [key: string]: string }, workDir: vscode.Uri): Promise<Map<string, string>> {
    // Re-summarise each parent function summary by including the child summaries

    function buildPrompt(parentSymbol: string, childSymbols: string[]) {
        const childSummaryTemplates = childSymbols.map((childSymbol) => `{${childSymbol}}`).join("\n");
        return new PromptTemplate({
            inputVariables: [parentSymbol, ...childSymbols],
            template: `Below is a parent function summary and summaries of the child functions called inside it. Output just a refined parent function summary based on the child function summaries, reducing redundancy and creating a coherent narrative flow. Output a single, plaintext sentence.
            """
    {${parentSymbol}}
    """
    Child function summaries:    """
    ${childSummaryTemplates}
    """`,
        });
    }
    const allFunctionSummaryChains: { [key: string]: Runnable<any, string, RunnableConfig> } = {};
    const outputParser = new StringOutputParser();
    const queue: DefinitionNode[] = [graph.definitionNodes[topLevelFunction]];
    const refineModelName = 'gpt-3.5-turbo';
    const model = new ChatOpenAI({ temperature: 0, modelName: refineModelName });
    while (queue.length > 0) {
        const node = queue.shift()!;
        if (!allFunctionSummaryChains[node.symbol]) {
            const childSymbols = node.children.map(child => child.symbol);
            const chain = buildPrompt(node.symbol, childSymbols).pipe(model).pipe(outputParser);
            allFunctionSummaryChains[node.symbol] = chain;
            node.children.forEach(child => {
                queue.push(graph.definitionNodes[child.symbol]);
            });
        }
    }
    const refinedSummaries = await RunnableMap.from(allFunctionSummaryChains).invoke(summaries);
    fs.writeFile(`${workDir.fsPath}/refinedSummaries_${refineModelName}.json`, JSON.stringify(refinedSummaries), 'utf8', (err) => { });
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