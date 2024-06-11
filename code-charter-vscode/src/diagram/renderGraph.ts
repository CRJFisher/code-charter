import { GraphvizOptions, Graphviz } from "d3-graphviz";


declare module 'd3-selection' {
    interface Selection<GElement extends BaseType, Datum, PElement extends BaseType, PDatum> {
        graphviz(options?: GraphvizOptions | boolean): Graphviz<GElement, Datum, PElement, PDatum>;
    }
}

async function renderGraph(dotString: string): Promise<void> {
    const d3 = await import('d3');
    const { graphviz } = await import('d3-graphviz');
    // catch the renderDot error
    d3.select("#graph")
        .graphviz()
        .renderDot(dotString)
        .onerror(console.error);
}
