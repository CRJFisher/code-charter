// import 'reflect-metadata';
import { Type } from 'class-transformer';

class DocRange {
    startLine!: number;
    startCharacter!: number;
    endLine!: number;
    endCharacter!: number;
}

class ReferenceNode {
    @Type(() => DocRange)
    range!: DocRange;

    symbol!: string;
}

class DefinitionNode {
    @Type(() => DocRange)
    enclosingRange!: DocRange;

    document!: string;

    symbol!: string;

    children!: ReferenceNode[];
}

class CallGraph {
    topLevelNodes!: string[];

    @Type(() => DefinitionNode)
    definitionNodes!: Record<string, DefinitionNode>;
}

function symbolRepoLocalName(symbol: string): string {
    let shortened = symbol.split(" ").slice(4).join(" ")
        .replace(/`|\//g, ".")
        .replace(/\(|\)/g, "")
        .replace(/\.\./g, ".");
    shortened = shortened.replace(/^\./, "").replace(/\.$/, "");
    return shortened;
}

function symbolDisplayName(symbol: string): string {
    return symbolRepoLocalName(symbol).split(".").pop() || '';
}

class TreeAndContextSummaries {
    functionSummaries: Map<string, string>;
    refinedFunctionSummaries: Map<string, string>;
    contextSummary: string;
    constructor(treeSummary: Map<string, string>, refinedTreeSummary: Map<string, string>, contextSummary: string) {
        this.functionSummaries = treeSummary;
        this.refinedFunctionSummaries = refinedTreeSummary;
        this.contextSummary = contextSummary;
    }
}

export { CallGraph, DefinitionNode, TreeAndContextSummaries, symbolRepoLocalName, symbolDisplayName };
