import * as fs from 'fs/promises';
import * as vscode from "vscode";
import { CallGraph, symbolDisplayName, symbolRepoLocalName } from '../summarise/models';

async function callGraphToMermaid(
    topLevelFunction: string,
    graph: CallGraph,
    summaries: Map<string, string>,
    outfilePath: vscode.Uri,
): Promise<void> {
    //   const callGraphNode: CallGraphNode[] = JSON.parse(await fs.readFile("out/call_graph.json", "utf-8"));
    //   const summaries: { [key: string]: string } = JSON.parse(await fs.readFile("summaries.json", "utf-8"));

    const [subgraphs, connections] = generateMermaid(topLevelFunction, graph, summaries);
    const mermaidSyntax = createMermaidDiagram(subgraphs, connections);
    const mermaidBlock = `\`\`\`mermaid\n${mermaidSyntax}\n\`\`\``;
    await vscode.workspace.fs.writeFile(outfilePath, Buffer.from(mermaidBlock));
}

function generateMermaid(
    topLevelFunction: string,
    graph: CallGraph,
    summaries: Map<string, string>,
    subgraphs: Map<string, string[]> = new Map(),
    connections: string[] = [],
    visitedNodes: Set<string> = new Set()
): [Map<string, string[]>, string[]] {
    const node = graph.definitionNodes[topLevelFunction];
    const document = node.document;
    const nodeId = symbolRepoLocalName(topLevelFunction);

    if (visitedNodes.has(nodeId)) {
        return [subgraphs, connections];
    }
    visitedNodes.add(nodeId);

    const nodeSummary = summaries.get(node.symbol);
    if (!nodeSummary) {
        throw new Error(`Summary not found for ${node.symbol}`);
    }
    const summary = nodeSummary.trim();
    const lengthLimitedSegments = summary.split(".").flatMap(sentence => splitSentence(sentence));
    const splitSummary = lengthLimitedSegments.join("\n");
    const nodeLabel = `["<strong>${symbolDisplayName(node.symbol)}</strong> \n ${splitSummary}"]`;
    if (!subgraphs.has(document)) {
        subgraphs.set(document, []);
    }
    subgraphs.get(document)?.push(`${nodeId}${nodeLabel}`);

    node.children.forEach((child, index) => {
        const childId = symbolRepoLocalName(child.symbol);
        const linkStr = node.children.length > 1 ? `--${index + 1}-->` : "-->";
        connections.push(`${nodeId} ${linkStr} ${childId}`);
        generateMermaid(child.symbol, graph, summaries, subgraphs, connections, visitedNodes);
    });

    return [subgraphs, connections];
}

function splitSentence(sentence: string, wordLimit: number = 6): string[] {
    if (!sentence) {
        return [];
    }
    const segments: string[] = [];
    const words = sentence.split(" ");
    let currentSegment = "";
    words.forEach(word => {
        if (currentSegment.split(" ").length >= wordLimit) {
            segments.push(currentSegment.trim());
            currentSegment = "";
        }
        currentSegment += ` ${word}`;
    });
    segments.push(currentSegment.trim() + (currentSegment.trim().endsWith(".") ? "" : "."));
    return segments;
}

function createMermaidDiagram(subgraphs: Map<string, string[]>, connections: string[]): string {
    const mermaidSyntax: string[] = ["graph TB"];
    subgraphs.forEach((nodes, document) => {
        mermaidSyntax.push(`subgraph ${document.replace(/ /g, "")} ["${document}"]`);
        mermaidSyntax.push(...nodes);
        mermaidSyntax.push("end");
    });
    mermaidSyntax.push(...connections);
    return mermaidSyntax.join("\n");
}

export { callGraphToMermaid };