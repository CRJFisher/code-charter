import { plainToInstance } from "class-transformer";
import * as fs from "fs";
import { CallGraphNode } from "./models";
import * as fsProm from 'fs/promises';
import * as vscode from 'vscode';
// import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { Runnable, RunnableConfig } from "@langchain/core/runnables";

async function summariseCallGraph(callGraphNode: CallGraphNode, workDir: vscode.Uri, workspacePath: vscode.Uri,): Promise<Map<string, string>> {
    const callGraphSummaries = new Map<string, string>();
    // TODO: use LLM API in chain

    const prompt = new PromptTemplate({
        inputVariables: ["code"],
        template: `Please provide two generate summaries for the following code. The first summary should focus on the business logic, explaining the overall purpose and intended use of the code in abstract terms. The second summary should detail the implementation, describing the technical aspects and how the code functions internally.
The summaries should be written in the concise, condensed style like a code comment, i.e. omit preambles like "This code..." or "This method...". Write a --- between the two summaries. Output example:
"""
Sends messages to connected websockets.
---
Retrieves messages from a queue and sends them to the specified websocket, as long as the websocket is active.
"""
Verify that the symbol: "---" is used exactly once in the output, it is essential that it is present.

Note that the code includes function calls, each preceded by two comments: one for business logic (marked with '---bl:') and the other for implementation details (marked with '---imp:'). 

Here is the code:
"""
{code}
"""
    `    });


    const model = new ChatAnthropic({
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });
    // const model = new ChatOpenAI({
    //     modelName: "gpt-4",
    //     temperature: 0,
    //     n: 1,
    // });
    const outputParser = new StringOutputParser();
    const chain = prompt.pipe(model).pipe(outputParser);


    // const craftedPrompt = [
    //     new vscode.LanguageModelChatSystemMessage(
    //       'You are a cat! Think carefully and step by step like a cat would. Your job is to explain computer science concepts in the funny manner of a cat, using cat metaphors. Always start your response by stating what concept you are explaining. Always include code samples.'
    //     ),
    //     new vscode.LanguageModelChatUserMessage('I want to understand recursion')
    //   ];
    // try {
    //     const chatRequest = vscode.lm.sendChatRequest(
    //       'copilot-gpt-3.5-turbo',
    //       craftedPrompt,
    //       {},
    //       token
    //     );
    //   } catch (err) {
    //     // Making the chat request might fail because
    //     // - model does not exist
    //     // - user consent not given
    //     // - quota limits were exceeded
    //     if (err instanceof vscode.LanguageModelError) {
    //       console.log(err.message, err.code, err.cause);
    //     } else {
    //       // add other error handling logic
    //     }
    //   }


    await leafToRootSummarisation(
        callGraphNode,
        new Map<string, Promise<string>>(),
        callGraphSummaries,
        chain,
        workspacePath,
    );
    // Write summaries to file
    const nodeName = callGraphNode.displayName;
    await fsProm.writeFile(`${workDir.fsPath}/summaries-${nodeName}.json`, JSON.stringify([...callGraphSummaries.entries()]));
    return callGraphSummaries;
}

async function leafToRootSummarisation(
    node: CallGraphNode,
    summaryFutures: Map<string, Promise<string>>,
    summaries: Map<string, string>,
    chain: Runnable<any, string, RunnableConfig>,
    workspacePath: vscode.Uri,
): Promise<void> {
    if (summaryFutures.has(node.symbol)) {
        await summaryFutures.get(node.symbol);
        return;
    }

    const future: Promise<string> = (async () => {
        await Promise.all(
            node.children.map(child => leafToRootSummarisation(child, summaryFutures, summaries, chain, workspacePath))
        );

        const childSummaries: { [key: string]: string } = {};
        for (const child of node.children) {
            childSummaries[child.symbol] = await summaryFutures.get(child.symbol)!;
        }

        console.log(childSummaries);

        const codeBlock = await getCodeFromDocAndAddFunctionSummaries(node, childSummaries, workspacePath);
        const summaryText = await chain.invoke({ code: codeBlock });

        summaries.set(node.symbol, summaryText);
        return summaryText;
    })();

    summaryFutures.set(node.symbol, future);
    await future;
}

async function getCodeFromDocAndAddFunctionSummaries(
    node: CallGraphNode,
    summaries: { [key: string]: string },
    workspacePath: vscode.Uri,
): Promise<string> {
    const filePath = `${workspacePath.fsPath}/${node.definition_node.document}`;
    console.log(filePath);
    const code = (await fsProm.readFile(filePath, 'utf8')).split('\n');

    for (const enclosedNode of node.children) {
        const [bl, impl] = summaries[enclosedNode.symbol].split("---");
        const callCodeLine = enclosedNode.reference_node?.range.start_line!;
        const callLineWithSummaryPrefix = `---bl: ${bl.trim()}\n---imp: ${impl.trim()}\n${code[callCodeLine]}`;
        code[callCodeLine] = callLineWithSummaryPrefix;
    }

    const start = node.definition_node.enclosing_range.start_line;
    const end = node.definition_node.enclosing_range.end_line + 1;
    const codeBlock = code.slice(start, end).join('\n');
    return codeBlock;
}

async function readCallGraphJsonFile(callGraphFile: vscode.Uri): Promise<CallGraphNode[]> {
    // Read the JSON file
    const jsonString = await fs.promises.readFile(callGraphFile.fsPath, 'utf8');
    // Ensure the JSON is parsed into an array and then deserialized into CallGraphNode instances
    const jsonParsed = JSON.parse(jsonString);
    if (!Array.isArray(jsonParsed)) {
        throw new Error("Expected an array of call graph nodes");
    }
    return plainToInstance(CallGraphNode, jsonParsed, { enableCircularCheck: true });
}

export { summariseCallGraph, readCallGraphJsonFile };