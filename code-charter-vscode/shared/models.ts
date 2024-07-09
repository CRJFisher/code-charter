interface TopLevelFunction {
    symbol: string
    displayName: string
    document: string
    nodeCount: number
}

interface ProjectEnvironmentId {
    id: string
    name: string
}

interface CallGraphNode {
    symbol: string
    displayName: string
    summary: string
    document: string

    children: CallGraphNode[]
}

interface DocRange {
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
}

interface ReferenceNode {
    range: DocRange;
    symbol: string;
}

interface DefinitionNode {
    enclosingRange: DocRange;

    document: string;

    symbol: string;

    children: ReferenceNode[];
}

interface CallGraph {
    topLevelNodes: string[];
    definitionNodes: Record<string, DefinitionNode>;
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

interface TreeAndContextSummaries {
    functionSummaries: Record<string, string>;
    refinedFunctionSummaries: Record<string, string>;
    contextSummary: string;
}

export type {
    TopLevelFunction,
    ProjectEnvironmentId,
    DocRange,
    ReferenceNode,
    DefinitionNode,
    CallGraphNode,
    CallGraph,
    TreeAndContextSummaries,
};

export {
    countNodes,
}; 

