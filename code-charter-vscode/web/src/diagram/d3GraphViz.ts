
import { Digraph, toDot, NodeModel, Subgraph } from 'ts-graphviz';
import { CallGraph, DefinitionNode } from '../../../shared/models';
import { symbolDisplayName, symbolRepoLocalName } from '../../../shared/symbols';

export async function callGraphToDOT(
    topLevelFunction: string,
    graph: CallGraph,
    summaries: Record<string, string>,
): Promise<string> {
    const dotGraph = generateDOT(topLevelFunction, graph, summaries);
    const dotSyntax = toDot(dotGraph);
    return dotSyntax;
}

export function generateDOT(
    topLevelFunctionSymbol: string,
    graph: CallGraph,
    summaries: Record<string, string>
): Digraph {
    const dotGraph = new Digraph({ fontname: "Helvetica, Arial, sans-serif", fontsize: 12, });
    const visitedNodes = new Set<string>();
    const visitedEdges = new Set<string>();

    function addNodeAndEdges(symbol: string): NodeModel {

        function getNodeId(symbol: string): string {
            return sanitizeSymbolName(symbolRepoLocalName(symbol));
        }

        function getSubgraphId(defNode: DefinitionNode) {
            return `cluster_${defNode.document}`; // subgraph IDs need to be prefixed with "cluster_" to get rendered as clusters
        }

        const node = graph.definitionNodes[symbol];
        const nodeId = getNodeId(node.symbol);

        const nodeSummary = summaries[node.symbol];
        if (!nodeSummary) {
            throw new Error(`Summary not found for ${node.symbol}`);
        }
        const summary = escapeHtml(nodeSummary.trim());
        const lengthLimitedSegments = summary.split(".").flatMap(sentence => splitSentence(sentence));
        const splitSummary = lengthLimitedSegments.join("<br/>");
        const nodeLabel = `<
            <table border="0" cellborder="0" cellspacing="0">
            <tr><td><b>${escapeHtml(symbolDisplayName(node.symbol))}</b></td></tr>
            <tr><td>${splitSummary}</td></tr>
            </table>
            >`;

        const nodeSubgraphId = getSubgraphId(node);
        let nodeSubgraph = dotGraph.getSubgraph(nodeSubgraphId);
        if (!nodeSubgraph) {
            nodeSubgraph = new Subgraph(nodeSubgraphId, { label: node.document, style: "dashed", bgcolor: "lightgrey", fontname: "Helvetica, Arial, sans-serif", fontsize: 12, });
            dotGraph.addSubgraph(nodeSubgraph);
        }

        const existingNode = nodeSubgraph.getNode(nodeId);
        if (existingNode) {
            throw new Error(`Node already exists (${node.symbol}). This function should not be called if node already exists.`);
        }
        visitedNodes.add(node.symbol);
        const createdNode = nodeSubgraph.createNode(nodeId, { label: nodeLabel, style: "filled", fillcolor: "white", });

        node.children.forEach((child, i) => {
            let childNode: NodeModel;
            const childNodeId = getNodeId(child.symbol);
            if (visitedNodes.has(child.symbol)) {
                const childSubgraphId = getSubgraphId(graph.definitionNodes[child.symbol]);    
                const childSubgraph = dotGraph.getSubgraph(childSubgraphId);
                if (!childSubgraph) {
                    throw new Error(`Subgraph not found for visited node (${child.symbol})`);
                }
                const visitedNode = childSubgraph.getNode(childNodeId);
                if (!visitedNode) {
                    throw new Error(`Visited node (${child.symbol}) not found in subgraph (${node.document})`);
                }
                childNode = visitedNode;
            } else {
                childNode = addNodeAndEdges(child.symbol);
            }
            const edgeId = `${nodeId}->${childNodeId}`;
            if (!visitedEdges.has(edgeId)) {
                const label = node.children.length > 1 ? `${i + 1}` : "";
                dotGraph.createEdge([createdNode, childNode], { label: label });
                visitedEdges.add(edgeId);
            }
        });

        return createdNode;
    }

    addNodeAndEdges(topLevelFunctionSymbol);

    return dotGraph;
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
