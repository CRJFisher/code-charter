import { ChatOllama } from "@langchain/community/chat_models/ollama";
import * as vscode from 'vscode';
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { Runnable, RunnableMap, RunnableConfig, RunnableBranch, RunnableLambda } from "@langchain/core/runnables";
import { TreeAndContextSummaries, CallGraph, DefinitionNode } from "@shared/codeGraph";
import PouchDB from "pouchdb";
import { hashText } from "../hashing";
import { symbolRepoLocalName } from "../../shared/symbols";
import { ModelDetails } from "src/model";

interface SummaryRecord {
    _id: string;
    symbol: string;
    summary: string;
    createdAt: Date;
}

async function summariseCallGraph(
    topLevelFunctionSymbol: string, 
    callGraph: CallGraph, 
    workDir: vscode.Uri, 
    workspacePath: vscode.Uri, 
    modelDetails: ModelDetails,
): Promise<TreeAndContextSummaries> {

    const topLevelFunctionName = symbolRepoLocalName(topLevelFunctionSymbol);

    const rootContext = await summariseRootScope(workDir, workspacePath, topLevelFunctionName, modelDetails);

    const definitionNodes = getAllDefinitionNodesFromCallGraph(callGraph, topLevelFunctionSymbol);

    const functionSymbolCode: Map<string, string> = await getSymbolToFunctionCode(definitionNodes, workspacePath);

    const functionSummaries = await getFunctionSummaries(workDir, functionSymbolCode, definitionNodes, modelDetails);

    const refinedFunctionSummaries = await refineSummaries(workDir, functionSummaries, definitionNodes, modelDetails);

    // (For debugging) write summaries to file
    // const outFile = `${workDir.fsPath}/summaries-${topLevelFunctionName.replace(' ', '')}.json`;
    // await vscode.workspace.fs.writeFile(vscode.Uri.file(outFile), Buffer.from(JSON.stringify(Object.fromEntries(refinedFunctionSummaries), null, 2)));

    const summaries = {
        functionSummaries: Object.fromEntries(functionSummaries),
        refinedFunctionSummaries: Object.fromEntries(refinedFunctionSummaries),
        contextSummary: rootContext,
    };
    return summaries;
}

async function summariseRootScope(workDir: vscode.Uri, workspacePath: vscode.Uri, topLevelFunctionName: string, modelDetails: ModelDetails): Promise<string> {
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
    const rootContextSummaryChain = rootContextPrompt.pipe(modelDetails.model).pipe(new StringOutputParser());
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

async function getFunctionSummaries(workDir: vscode.Uri, functionCode: Map<string, string>, allFunctionNodes: Map<string, DefinitionNode>, modelDetails: ModelDetails): Promise<Map<string, string>> {
    function buildPrompt(symbol: string) {
        return new PromptTemplate({
            inputVariables: [symbol],
            template: `Describe the below code flow concisely, focusing on business logic and related, relevant control flow. Avoid framing language. 
            Directly describe the function's purpose and interactions, e.g., 'Calculates total price with tax.', keeping to a single, plaintext sentence.
            """
            {${symbol}}
            """`,
        });
    }

    const functionSummariesDb = new PouchDB<SummaryRecord>(`${workDir.fsPath}/functionSummaries-${modelDetails.uid}`);

    const outputParser = new StringOutputParser();

    const allFunctionSummaryChains: { [key: string]: Runnable<any, string, RunnableConfig> } = {};
    for (const [symbol, _] of allFunctionNodes) {
        const code = functionCode.get(symbol);
        if (!code) {
            throw new Error(`Code not found for symbol ${symbol}`);
        }
        const summaryKey = hashText(symbol, code);
        const summaryChain = buildPrompt(symbol).pipe(modelDetails.model).pipe(outputParser);
        const summaryFromCacheOrLLMChain = await getSummaryWithCachingChain(summaryChain, functionSummariesDb, summaryKey, symbol);
        allFunctionSummaryChains[symbol] = summaryFromCacheOrLLMChain;
    }

    try {
        const summaries = await RunnableMap.from(allFunctionSummaryChains).invoke(Object.fromEntries(functionCode));
        return new Map(Object.entries(summaries));
    } catch (error) {
        console.error("Error summarising functions:", error);
        throw error;
    }
    // "{
    //   name: "HeadersTimeoutError",
    //   code: "UND_ERR_HEADERS_TIMEOUT",
    //   message: "Headers Timeout Error",
    // }"
}

async function getSummaryWithCachingChain(summaryChain: Runnable<any, string, RunnableConfig>, functionSummariesDb: PouchDB.Database<SummaryRecord>, summaryKey: string, symbol: string) {
    const summaryWithCacheChain = summaryChain.pipe(RunnableLambda.from(async (summary: string) => {
        await functionSummariesDb.put({
            _id: summaryKey,
            summary: summary,
            symbol: symbol,
            createdAt: new Date(),
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
                // console.log(`Using cached summary for ${symbol}`);
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
        const code = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath)).then((buffer) => new TextDecoder().decode(buffer));
        const codeLines = code.split('\n');
        const functionLines = codeLines.slice(n.enclosingRange.startLine, n.enclosingRange.endLine);
        nodeCode.set(n.symbol, functionLines.join('\n'));
    }));
    return nodeCode;
}

async function refineSummaries(workDir: vscode.Uri, summaries: Map<string, string>, allFunctionNodes: Map<string, DefinitionNode>, modelDetails: ModelDetails): Promise<Map<string, string>> {
    // Re-summarise each parent function summary by including the child summaries

    function buildPrompt(parentSymbol: string, childSymbols: string[]) {
        const childSummaryTemplates = childSymbols.map((childSymbol) => `{${childSymbol}}`).join("\n");
        return new PromptTemplate({
            inputVariables: [parentSymbol, ...childSymbols],
            template: `Below is a parent function description and the descriptions of the child functions called inside it. 
            Output just a refined parent function description based on the child function descriptions, providing a higher-level description for the parent including the key business logic control flow. 
            Output a single, plaintext sentence.
            """
            {${parentSymbol}}
            """
            Child function summaries: 
            """
            ${childSummaryTemplates}
            """`,
        });
    }

    const refinedFunctionSummariesDb = new PouchDB<SummaryRecord>(`${workDir.fsPath}/refinedFunctionSummaries-${modelDetails.uid}`);

    const outputParser = new StringOutputParser();
    const allFunctionSummaryChains: { [key: string]: Runnable<any, string, RunnableConfig> } = {};
    for (const [_, node] of allFunctionNodes) {
        const childSymbols = node.children.map(child => child.symbol);
        const summaryChain = buildPrompt(node.symbol, childSymbols).pipe(modelDetails.model).pipe(outputParser);
        const allSummaries = [summaries.get(node.symbol), ...childSymbols.map(childSymbol => summaries.get(childSymbol))];
        const summaryKey = hashText(node.symbol, allSummaries.join(''));
        const summaryFromCacheOrLLMChain = await getSummaryWithCachingChain(summaryChain, refinedFunctionSummariesDb, summaryKey, node.symbol);
        allFunctionSummaryChains[node.symbol] = summaryFromCacheOrLLMChain;
    }

    try {

        const refinedSummaries = await RunnableMap.from(allFunctionSummaryChains).invoke(Object.fromEntries(summaries));
        return new Map(Object.entries(refinedSummaries));
    }
    catch (error) {
        console.error("Error refining summaries:", error);
        return summaries;
    }

}

async function readCallGraphJsonFile(callGraphFile: vscode.Uri): Promise<CallGraph> {
    // Read the JSON file
    const jsonString = await vscode.workspace.fs.readFile(callGraphFile).then((buffer) => new TextDecoder().decode(buffer));
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
                return await vscode.workspace.fs.readFile(vscode.Uri.joinPath(directoryPath, fileName)).then((buffer) => new TextDecoder().decode(buffer));
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

export { summariseCallGraph, readCallGraphJsonFile };
