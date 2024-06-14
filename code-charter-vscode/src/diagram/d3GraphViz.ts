import { CallGraph, symbolDisplayName, symbolRepoLocalName } from '../summarise/models';

import { Digraph, toDot, NodeModel, Edge, Subgraph } from 'ts-graphviz';
import * as vscode from 'vscode';

export async function callGraphToDOT(
    topLevelFunction: string,
    graph: CallGraph,
    summaries: Map<string, string>,
    outfileFolder: vscode.Uri,
): Promise<string> {
    const dotSyntax = generateDOT(topLevelFunction, graph, summaries);
    // Save DOT syntax to a file
    const outfilePath = vscode.Uri.joinPath(outfileFolder, 'dot.txt');
    await vscode.workspace.fs.writeFile(outfilePath, Buffer.from(dotSyntax));
    return dotSyntax;
}

function generateDOT(
    topLevelFunctionSymbol: string,
    graph: CallGraph,
    summaries: Map<string, string>
): string {
    const dotGraph = new Digraph({ fontname: "Helvetica", fontsize: 12, });
    const visitedNodes = new Set<string>();
    const visitedEdges = new Set<string>();

    function addNodeAndEdges(symbol: string): NodeModel {
        const node = graph.definitionNodes[symbol];
        const nodeId = sanitizeSymbolName(symbolRepoLocalName(symbol));

        const nodeSummary = summaries.get(node.symbol);
        if (!nodeSummary) {
            throw new Error(`Summary not found for ${node.symbol}`);
        }
        const summary = escapeHtml(nodeSummary.trim());
        const lengthLimitedSegments = summary.split(".").flatMap(sentence => splitSentence(sentence));
        const splitSummary = lengthLimitedSegments.join("<br/>"); // HTML uses <br/> for new lines
        const nodeLabel = `<
            <table border="0" cellborder="0" cellspacing="0">
            <tr><td><b>${escapeHtml(symbolDisplayName(node.symbol))}</b></td></tr>
            <tr><td>${splitSummary}</td></tr>
            </table>
            >`;

        let nodeSubgraph = dotGraph.getSubgraph(node.document);
        if (!nodeSubgraph) {
            nodeSubgraph = new Subgraph(`cluster_${node.document}`, { label: node.document, style: "dashed", bgcolor: "lightgrey", fontname: "Helvetica", fontsize: 12, });
            dotGraph.addSubgraph(nodeSubgraph);
        }

        const existingNode = nodeSubgraph.getNode(nodeId);
        if (existingNode) {
            return existingNode;
        }
        visitedNodes.add(node.symbol);
        const createdNode = nodeSubgraph.createNode(nodeId, { label: nodeLabel, color: "grey" });

        node.children.forEach((child, i) => {
            const childNode = visitedNodes.has(child.symbol) ? nodeSubgraph.getNode(sanitizeSymbolName(symbolRepoLocalName(child.symbol))) : addNodeAndEdges(child.symbol);
            const edgeId = `${nodeId}->${sanitizeSymbolName(symbolRepoLocalName(child.symbol))}`;
            if (!visitedEdges.has(edgeId)) {
                const label = node.children.length > 1 ? `${i + 1}` : "";
                dotGraph.createEdge([createdNode, childNode], { label: label });
                visitedEdges.add(edgeId);
            }
        });

        return createdNode;
    }

    addNodeAndEdges(topLevelFunctionSymbol);

    return toDot(dotGraph);
}

function escapeHtml(unsafe: string): string {
    return unsafe.replace(/[&<"']/g, (match) => {
        switch (match) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '"': return '&quot;';
            case "'": return '&#039;';
            default: return match;
        }
    });
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

function sanitizeSymbolName(symbolName: string): string {
    return symbolName.replace(/\./g, "_");
}
