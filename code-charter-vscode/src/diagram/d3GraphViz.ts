import * as vscode from 'vscode';
import { CallGraph, symbolDisplayName, symbolRepoLocalName } from '../summarise/models';

export async function callGraphToDOT(
    topLevelFunction: string,
    graph: CallGraph,
    summaries: Map<string, string>,
    outfileFolder: vscode.Uri,
): Promise<string> {
    const [nodes, edges] = generateDOT(topLevelFunction, graph, summaries);
    const dotSyntax = createDOTDiagram(nodes, edges);
    // await vscode.workspace.fs.writeFile(outfilePath, Buffer.from(dotSyntax));
    // Save DOT syntax to a JSON file
    // todo: pass in out file folder, add 'graph.json' to the end of the path here (since this will know about the string replacement in the html file)
    const outfilePath = vscode.Uri.joinPath(outfileFolder, 'dot.txt');
    await vscode.workspace.fs.writeFile(outfilePath, Buffer.from(dotSyntax));
    return dotSyntax;
}

function generateDOT(
    topLevelFunction: string,
    graph: CallGraph,
    summaries: Map<string, string>,
    nodes: Set<string> = new Set(),
    edges: string[] = [],
    visitedNodes: Set<string> = new Set()
): [Set<string>, string[]] {
    const node = graph.definitionNodes[topLevelFunction];
    // const nodeId = symbolRepoLocalName(topLevelFunction);
    const nodeId = sanitizeSymbolName(symbolRepoLocalName(topLevelFunction));

    if (visitedNodes.has(nodeId)) {
        return [nodes, edges];
    }
    visitedNodes.add(nodeId);

    const nodeSummary = summaries.get(node.symbol);
    if (!nodeSummary) {
        throw new Error(`Summary not found for ${node.symbol}`);
    }
    const summary = nodeSummary.trim();
    const lengthLimitedSegments = summary.split(".").flatMap(sentence => splitSentence(sentence));
    const splitSummary = lengthLimitedSegments.join("\\n"); // DOT uses \n for new lines
    const nodeLabel = `"${nodeId}" [label="${symbolDisplayName(node.symbol)}\\n${splitSummary}"];`;
    nodes.add(nodeLabel);

    node.children.forEach((child, index) => {
        // const childId = symbolRepoLocalName(child.symbol);
        const childId = sanitizeSymbolName(symbolRepoLocalName(child.symbol));
        edges.push(`"${nodeId}" -> "${childId}";`);
        generateDOT(child.symbol, graph, summaries, nodes, edges, visitedNodes);
    });

    return [nodes, edges];
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

function createDOTDiagram(nodes: Set<string>, edges: string[]): string {
    const dotSyntax: string[] = ["digraph G {"];
    nodes.forEach(node => dotSyntax.push(`  ${node}`));
    edges.forEach(edge => dotSyntax.push(`  ${edge}`));
    dotSyntax.push("}");
    return dotSyntax.join("\n");
}

function sanitizeSymbolName(symbolName: string): string {
    return symbolName.replace(/\./g, "_");
}
