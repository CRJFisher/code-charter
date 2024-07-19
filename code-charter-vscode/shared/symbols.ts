// TODO: put these into a shared ts folder to be compiled by both web and node versions 

function symbolRepoLocalName(symbol: string): string {
    let shortened = symbol.split(" ").slice(4).join(" ")
        .replace(/`|\//g, ".")
        .replace(/\(|\)/g, "")
        .replace(/\.\./g, ".");
    shortened = shortened.replace(/^\./, "").replace(/\.$/, "");
    return shortened;
}

function symbolDisplayName(symbol: string): string {
    const finalSection = symbolRepoLocalName(symbol).split(".").pop() || '';
    return finalSection.replace('#', '.').replace('__', '');
}

export { symbolRepoLocalName, symbolDisplayName };