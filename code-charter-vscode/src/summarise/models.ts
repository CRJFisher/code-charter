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

export { TreeAndContextSummaries, symbolRepoLocalName, symbolDisplayName };
