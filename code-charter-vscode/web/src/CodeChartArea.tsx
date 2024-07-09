import React, { useEffect, useRef, useState } from 'react';
import { CallGraph, DefinitionNode, TreeAndContextSummaries } from 'shared/models';
import { summariseCodeTree } from './vscodeApi';
import { callGraphToDOT } from './diagram/d3GraphViz';
import { graphviz } from 'd3-graphviz';
import * as d3 from 'd3';
import { BaseType, Transition } from 'd3';
// import { Graphviz } from '@hpcc-js/wasm';

// import React, { useEffect, useRef } from 'react';
// import { select as d3Select} from 'd3-selection';
// import 'd3-graphviz';
// function G() {

//     const Graph = (props) => {
//         const divRef = useRef();
//         const graphviz = useRef();
//         useEffect(()=>{
//             divRef.current = d3Select("#graph");
//             createGraph();
//         }, []);
//         const handleError = (errorMessage) => {let line = errorMessage.replace(/.*error in line ([0–9]*) .*\n/, '$1');
//             console.error({message: errorMessage, line: line});
//         }
//         const createGraph = () => {
//             wasmFolder('/@hpcc-js/wasm/dist');
//             graphviz.current = divRef.current.graphviz().onerror(handleError).on('initEnd', () => renderGraph());
//         }
//         const renderGraph = () => {
//             graphviz.current.renderDot(props.dotSrc);
//         }
//         return (<React.Fragment><div id="graph"style={{width:'100%',height:'100vh'}}></div></React.Fragment>);}
// }

interface CodeChartAreaProps {
    selectedEntryPoint: DefinitionNode | null;
    callGraph: CallGraph;
}

export const CodeChartArea: React.FC<CodeChartAreaProps> = ({ selectedEntryPoint, callGraph }) => {
    // const [summaries, setSummaries] = useState<TreeAndContextSummaries>({ functionSummaries: {}, refinedFunctionSummaries: {}, contextSummary: '' });
    // const [dotString, setDotString] = useState<string>('');
    const graphRef = useRef<HTMLDivElement>(null);

    function attributer(this: BaseType, datum: { tag: string; attributes: { width: string; height: string; }; }, index: any, nodes: any) {
        const margin = 20;
        var selection = d3.select(this);
        if (datum.tag == "svg") {
            var width = window.innerWidth - margin;
            var height = window.innerHeight - margin;
            var x = "10";
            var y = "10";
            var unit = "px";
            selection.attr("width", width + unit).attr("height", height + unit);
            datum.attributes.width = width + unit;
            datum.attributes.height = height + unit;
        }
    }

    useEffect(() => {
        if (!selectedEntryPoint) {
            return;
        }
        const fetchData = async () => {
            const summaries = await summariseCodeTree(selectedEntryPoint.symbol);
            if (!summaries) {
                return;
            }
            // setSummaries(summaries);
            const dot = await callGraphToDOT(selectedEntryPoint.symbol, callGraph, summaries.functionSummaries);
            // setDotString(dot);

            if (graphRef.current) {
                const graphvizInstance = graphviz(graphRef.current)
                    .attributer(attributer)
                    .transition((): any => {
                        return d3.transition().duration(1000);
                    });

                    
                    function attributer(this: d3.BaseType, datum: { tag: string; attributes: { width: string; height: string; }; }, index: any, nodes: any) {
                        const margin = 20;
                        const selection = d3.select(this);
                        if (datum.tag === 'svg') {
                            const width = graphRef.current?.clientWidth || window.innerWidth - margin;
                            const height = graphRef.current?.clientHeight || window.innerHeight - margin;
                  
                            selection
                              .attr('width', '100%')
                              .attr('height', '100%')
                              .attr('viewBox', `0 0 ${width} ${height}`)
                              .attr('preserveAspectRatio', 'xMidYMid meet');
                  
                            datum.attributes.width = `${width}px`;
                            datum.attributes.height = `${height}px`;
                        }
                      }
                    
                    function render() {
                        graphvizInstance.renderDot(dot);
                    }
                    render();
            }

            // graphviz(".chart").attributer(attributer).renderDot(dot);
        };
        // Call the async function
        fetchData();
    }, [selectedEntryPoint, callGraph]);
    return (
        <main className="w-3/4 p-4 overflow-auto">
            {selectedEntryPoint ? (
                <>
                    <div id="chart-container" className="h-full" ref={graphRef}>
                    </div>
                </>
            ) : (
                <div className="text-center text-gray-500">Select an entry point to view the call graph.</div>
            )}
        </main>
    );
};
