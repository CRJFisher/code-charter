import React, { useEffect, useRef, useState } from 'react';
import { CallGraph, DefinitionNode, TreeAndContextSummaries } from '../../shared/codeGraph';
import { navigateToDoc, summariseCodeTree } from './vscodeApi';

import cytoscape, { Core } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { symbolDisplayName } from '../../shared/symbols';
import { getCssVariable } from './cssUtils';
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
                label: `⮕ ${symbolDisplayName(node.symbol)}\n\n${summaries[node.symbol].trimStart()}`,
                document: node.document,
                range: node.enclosingRange,
            },
            classes: isTopLevel ? 'top-level' : 'child',
        });
        let i = 1;
        const seenIds = new Set<string>();
        for (const child of node.children) {
            const edgeId = `${node.symbol}-${child.symbol}`;
            if (seenIds.has(edgeId)) { // TODO: improve visualisation of multiple edges between nodes
                continue;
            }
            elements.push({
                data: {
                    id: edgeId,
                    label: node.children.length > 1 ? i.toString() : '',
                    source: node.symbol,
                    target: child.symbol,
                },
            });
            i++;
            seenIds.add(edgeId);
            if (callGraph.definitionNodes[child.symbol]) {
                addNode(callGraph.definitionNodes[child.symbol], false);
            }
        }
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

    const bgColor = getCssVariable('--vscode-editor-background');
    const fgColor = getCssVariable('--vscode-editor-foreground');
    const selectionBgColor = getCssVariable('--vscode-editor-selectionBackground');
    const lineNumberColor = getCssVariable('--vscode-editorLineNumber-foreground');
    const editorBorderColor = getCssVariable('--vscode-editor-widget-border');
    const activeLineColor = getCssVariable('--vscode-editor-lineHighlightBackground');
    const inactiveSelectionBgColor = getCssVariable('--vscode-editor-inactiveSelectionBackground');
    const cursorColor = getCssVariable('--vscode-editorCursor-foreground');

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
                                shape: 'roundrectangle',
                                'text-valign': 'center',
                                'text-halign': 'center',
                                'background-color': bgColor,
                                color: fgColor,
                                'font-size': '14px',
                                'text-wrap': 'wrap',
                                'text-max-width': '180px',
                                'width': 'label',
                                'height': 'label',
                                'padding-left': '10px',
                                'padding-right': '10px',
                                'padding-top': '10px',
                                'padding-bottom': '10px',
                                'text-justification': 'left',
                            },
                        },
                        {
                            selector: '.multiline-auto',
                            style: {
                                'text-wrap': 'wrap',
                                'text-max-width': '80px',
                            }
                        },
                        {
                            selector: 'edge',
                            style: {
                                width: 2,
                                label: 'data(label)',
                                color: fgColor,
                                'line-color': fgColor,
                                'target-arrow-color': fgColor,
                                'target-arrow-shape': 'triangle',
                                'curve-style': 'bezier',
                                'text-margin-x': 10,
                                'text-margin-y': -10,
                            },
                        },
                        {
                            selector: '.top-level',
                            style: {
                                'background-color': bgColor,
                                //   'text-outline-color': bgColor,
                                'border-color': fgColor,
                                'border-width': 2,
                                color: fgColor,
                            },
                        },
                        {
                            selector: '.child',
                            style: {
                                'background-color': bgColor,
                                //   'text-outline-color': bgColor,
                                'border-color': fgColor,
                                'border-width': 2,
                                color: fgColor,
                            },
                        },
                    ],
                });
                cyRef.current = cy;
                cy.on('zoom', function (event) {
                    const zoomLevel = cy.zoom();
                    // console.log('Zoom level changed to:', zoomLevel);
                    // TODO: display different layers based on zoom level
                });
                window.addEventListener('resize', resizeContainer);
                function resizeContainer(newContainerHeight: any) {
                    containerRef.current!.style.height = window.innerHeight + 'px';
                    containerRef.current!.style.width = window.innerWidth * screenWidthFraction + 'px';
                    cy.resize();
                    cy.fit();
                }
                cy.on('click', 'node', async function (event) {
                    const node = event.target;
                    const definitionNode = callGraph.definitionNodes[node.id()];
                    await navigateToDoc(definitionNode.document, definitionNode.enclosingRange.startLine);
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
    }, [elements, bgColor, fgColor, selectionBgColor, lineNumberColor, editorBorderColor, activeLineColor, inactiveSelectionBgColor, cursorColor]);

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
