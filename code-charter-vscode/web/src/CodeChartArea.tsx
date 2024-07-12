import React, { useEffect, useRef, useState } from 'react';
import { CallGraph, DefinitionNode, TreeAndContextSummaries } from '../../shared/models';
import { navigateToDoc, summariseCodeTree } from './vscodeApi';
// import { graphviz } from 'd3-graphviz';
// import * as d3 from 'd3';
// import { BaseType, Transition } from 'd3';

import cytoscape, { Core } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { symbolDisplayName } from '../../shared/symbols';
cytoscape.use(dagre);

interface CodeChartAreaProps {
    selectedEntryPoint: DefinitionNode | null;
    callGraph: CallGraph;
    screenWidthFraction: number;
}

const generateElements = (selectedEntryPoint: DefinitionNode, callGraph: CallGraph, summaries: Record<string, string>) => {
    const elements: cytoscape.ElementDefinition[] = [];
    const visited = new Set<string>();

    const addNode = (node: DefinitionNode, isTopLevel: boolean) => {
        if (visited.has(node.symbol)) {
            return;
        }
        visited.add(node.symbol);

        elements.push({
            data: {
                id: node.symbol,
                label: `⮕ ${symbolDisplayName(node.symbol)}\n\n${summaries[node.symbol]}`,
                document: node.document,
                range: node.enclosingRange,
            },
            classes: isTopLevel ? 'top-level' : 'child',
        });

        node.children.forEach((child, i) => {
            elements.push({
                data: {
                    id: `${node.symbol}-${child.symbol}`,
                    label: i + 1,
                    source: node.symbol,
                    target: child.symbol,
                },
            });

            if (callGraph.definitionNodes[child.symbol]) {
                addNode(callGraph.definitionNodes[child.symbol], false);
            }
        });
    };

    addNode(selectedEntryPoint, true);
    return elements;
};

export const CodeChartArea: React.FC<CodeChartAreaProps> = ({ selectedEntryPoint, callGraph, screenWidthFraction }) => {
    const [elements, setElements] = useState<cytoscape.ElementDefinition[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<Core | null>(null);

    useEffect(() => {
        if (!selectedEntryPoint) {
            return;
        }
        const fetchData = async () => {
            const summaries = await summariseCodeTree(selectedEntryPoint.symbol);
            if (!summaries) {
                return;
            }
            const newElements = generateElements(selectedEntryPoint, callGraph, summaries.refinedFunctionSummaries);
            setElements(newElements);
        };
        fetchData();
    }, [selectedEntryPoint, callGraph]);

    useEffect(() => {
        if (containerRef.current && elements.length > 0) {
            if (!cyRef.current) {
                const cy = cytoscape({
                    container: containerRef.current,
                    elements,
                    layout: { name: 'dagre' },
                    style: [
                        {
                            selector: 'node',
                            style: {
                                label: 'data(label)',
                                shape: 'rectangle',
                                'text-valign': 'center',
                                'text-halign': 'center',
                                'background-color': '#0074D9',
                                'text-outline-color': '#0074D9',
                                'text-outline-width': 2,
                                color: '#fff',
                                'font-size': '14px', // Inherit from editor settings? No, vary based on zoom level i.e. zoomed out level needs large font
                                'text-wrap': 'wrap',
                                'text-max-width': '180px', // Adjust the max width as needed
                                // 'width': 'label',
                                // 'height': 'label',
                                // 'padding': '10px', // Add padding to the nodes
                                // "text-margin-x": 10,
                                // "text-margin-y": 10,
                                "width": "label",
                                "height": "label",
                                "padding-left": "10px",
                                "padding-right": "10px",
                                "padding-top": "10px",
                                "padding-bottom": "10px",
                                'text-justification': 'center', // Center the text within the node
                            },
                        },
                        {
                            "selector": ".multiline-auto",
                            "style": {
                                "text-wrap": "wrap",
                                "text-max-width": "80px",
                            }
                        },
                        {
                            selector: 'edge',
                            style: {
                                width: 2,
                                label: 'data(label)',
                                color: '#fff',
                                'line-color': '#ccc',
                                'target-arrow-color': '#ccc',
                                'target-arrow-shape': 'triangle',
                                'curve-style': 'bezier',
                                // 'text-rotation': 'autorotate', // Ensures the text follows the edge
                                'text-margin-x': 10, // Adjust the horizontal margin
                                'text-margin-y': -10, // Adjust the vertical margin,
                            },
                        },
                        {
                            selector: '.top-level',
                            style: {
                                'background-color': '#FF4136',
                                'text-outline-color': '#FF4136',
                            },
                        },
                        {
                            selector: '.child',
                            style: {
                                'background-color': '#0074D9',
                                'text-outline-color': '#0074D9',
                            },
                        },
                    ],
                });
                cyRef.current = cy;
                cy.on('zoom', function(event) {
                    var zoomLevel = cy.zoom();
                    // console.log('Zoom level changed to:', zoomLevel);
                    // TODO: display different layers based on zoom level
                });
                window.addEventListener('resize', resizeContainer);
                function resizeContainer(newContainerHeight: any){
                    containerRef.current!.style.height = window.innerHeight + 'px';
                    containerRef.current!.style.width = window.innerWidth * screenWidthFraction + 'px';
                    cy.resize();
                    cy.fit();
                }
                cy.on('click', 'node', async function(event) {
                    var node = event.target;
                    const definitionNode = callGraph.definitionNodes[node.id()];
                    await navigateToDoc(definitionNode.document, definitionNode.enclosingRange.startLine);
                    // cy.zoom(1);
                    // cy.center(node);
                    cy.animate({
                        zoom: 1, // Set the desired zoom level
                        center: {
                            eles: node // Center on the clicked node
                        },
                        duration: 100, // Duration of the animation in milliseconds
                        easing: 'ease-in-out' // Easing function for the animation
                    });
                });
            } else {
                cyRef.current.json({ elements });
                cyRef.current.layout({ name: 'dagre' }).run();
            }
        }
    }, [elements]);

    return (
        <main className="w-full overflow-auto">
            {selectedEntryPoint ? (
                <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
            ) : (
                <div className="text-center text-gray-500">Select an entry point to view the call graph.</div>
            )}
        </main>
    );
};
