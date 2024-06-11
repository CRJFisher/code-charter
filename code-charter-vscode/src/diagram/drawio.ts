import * as vscode from 'vscode';
import * as fs from 'fs';
import { CallGraph, symbolDisplayName, symbolRepoLocalName } from '../summarise/models';

async function callGraphToDrawIO(
    topLevelFunction: string,
    graph: CallGraph,
    summaries: Map<string, string>,
    outfilePath: vscode.Uri,
): Promise<void> {
    const [subgraphs, connections] = generateDrawIO(topLevelFunction, graph, summaries);
    const drawIOSyntax = createDrawIODiagram(subgraphs, connections);
    await vscode.workspace.fs.writeFile(outfilePath, Buffer.from(drawIOSyntax));
}

function generateDrawIO(
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
    const nodeLabel = `<mxCell id="${nodeId}" value="<b>${symbolDisplayName(node.symbol)}</b> \n ${splitSummary}" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1"/>`;
    if (!subgraphs.has(document)) {
        subgraphs.set(document, []);
    }
    subgraphs.get(document)?.push(nodeLabel);

    node.children.forEach((child, index) => {
        const childId = symbolRepoLocalName(child.symbol);
        const linkStr = node.children.length > 1 ? `--${index + 1}-->` : "-->";
        connections.push(`<mxCell id="connection${connections.length}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" source="${nodeId}" target="${childId}"/>`);
        generateDrawIO(child.symbol, graph, summaries, subgraphs, connections, visitedNodes);
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

function createDrawIODiagram(subgraphs: Map<string, string[]>, connections: string[]): string {
    const drawIOSyntax: string[] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<mxfile host="app.diagrams.net">',
        '<diagram>',
        '<mxGraphModel>',
        '<root>'
    ];
    drawIOSyntax.push('<mxCell id="0" />');
    drawIOSyntax.push('<mxCell id="1" parent="0" />');

    subgraphs.forEach((nodes) => {
        drawIOSyntax.push(...nodes);
    });

    drawIOSyntax.push(...connections);
    drawIOSyntax.push('</root>');
    drawIOSyntax.push('</mxGraphModel>');
    drawIOSyntax.push('</diagram>');
    drawIOSyntax.push('</mxfile>');

    return drawIOSyntax.join("\n");
}
