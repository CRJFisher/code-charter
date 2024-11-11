import React, { useEffect, useRef, useState } from "react";
import { CallGraph, DefinitionNode, NodeGroup } from "../../shared/codeGraph";
import { navigateToDoc } from "./vscodeApi";

import cytoscape, { Core, ElementDefinition, LayoutOptions, Stylesheet, StylesheetStyle } from "cytoscape";
import dagre from "cytoscape-dagre";


import fcose, { FcoseLayoutOptions } from "cytoscape-fcose";
import { symbolDisplayName } from "../../shared/symbols";
import {
  bgColor,
  editorBorderColor,
  fgColor,
  findMatchHighlightBgColor,
  gutterBgColor,
  hoverHighlightBgColor,
  inactiveSelectionBgColor,
  lineNumberColor,
  selectionBgColor,
  selectionFgColor,
  selectionHighlightBgColor,
} from "./colorTheme";

cytoscape.use(fcose);

type ZoomMode = "zoomedIn" | "zoomedOut";

interface CodeChartAreaProps {
  selectedEntryPoint: DefinitionNode | null;
  callGraph: CallGraph;
  nodeGroups: NodeGroup[] | undefined;
  screenWidthFraction: number;
  getSummaries: (nodeSymbol: string) => Promise<Record<string, string> | undefined>;
}

export const CodeChartArea: React.FC<CodeChartAreaProps> = ({
  selectedEntryPoint,
  callGraph,
  nodeGroups,
  screenWidthFraction,
  getSummaries,
}) => {
  const [elements, setElements] = useState<cytoscape.ElementDefinition[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("zoomedOut");
  const zoomModeRef = useRef<ZoomMode>(zoomMode);
  const nodeGroupsRef = useRef<NodeGroup[] | undefined>(nodeGroups);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    zoomModeRef.current = zoomMode;
  }, [zoomMode]);

  useEffect(() => {
    nodeGroupsRef.current = nodeGroups;
  }, [nodeGroups]);

  useEffect(() => {
    if (!selectedEntryPoint) {
      return;
    }
    const fetchData = async () => {
      const summaries = await getSummaries(selectedEntryPoint.symbol);
      if (!summaries) {
        return;
      }
      const newElements = generateElements(selectedEntryPoint, callGraph, summaries, nodeGroups);
      setElements(newElements);
    };
    fetchData();
  }, [selectedEntryPoint, callGraph, nodeGroups]);

  const layoutOptions: FcoseLayoutOptions = {
    name: "fcose",
    animate: true,
    animationDuration: 500,
    animationEasing: "ease-out",
    randomize: false,
    nodeDimensionsIncludeLabels: true,
    fit: true,
    nodeRepulsion: 100000,
    idealEdgeLength: 50,
    edgeElasticity: 0.1,
    gravity: 0,
    gravityCompound: 0,
    gravityRange: 0,
    gravityRangeCompound: 0,
    numIter: 2500,
  };

  const zoomLayoutOptions: FcoseLayoutOptions = {
    ...layoutOptions,
    animate: false, // Disable animation to prevent zoom level changes
    fit: false, // Prevent automatic zoom adjustment
  };

  const styles: cytoscape.Stylesheet[] = [
    // Common node style
    {
      selector: "node",
      style: {
        label: "data(label)",
        shape: "roundrectangle",
        "background-color": bgColor,
        color: fgColor,
        "font-size": "14px",
        "text-wrap": "wrap",
        width: "label",
        height: "label",
        "padding-left": "10px",
        "padding-right": "10px",
        "padding-top": "10px",
        "padding-bottom": "10px",
        "border-width": 1,
        "border-color": editorBorderColor,
      },
    },
    // Top-level node styles
    {
      selector: ".top-level-node",
      style: {
        "text-valign": "center",
        "text-halign": "center",
        "font-size": "18px",
        "background-color": findMatchHighlightBgColor,
        color: selectionHighlightBgColor,
        "border-width": 2,
        "border-color": editorBorderColor,
      },
    },
    // Regular node styles
    {
      selector: ".node",
      style: {
        "text-valign": "center",
        "text-halign": "center",
        "font-size": "14px",
        "background-color": bgColor,
        color: fgColor,
        "border-width": 1,
        "border-color": editorBorderColor,
      },
    },
    // Edge styles
    {
      selector: "edge",
      style: {
        width: 2,
        "line-color": lineNumberColor,
        "target-arrow-color": lineNumberColor,
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
      },
    },
    // Compound edge styles
    {
      selector: ".compound-edge",
      style: {
        width: 12,
        "line-color": editorBorderColor,
        "target-arrow-color": editorBorderColor,
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
      },
    },
    // Hidden elements
    {
      selector: ".hidden",
      style: {
        visibility: "hidden",
      },
    },
    // Hidden labels
    {
      selector: ".hidden-label",
      style: {
        "text-opacity": 0,
      },
    },
    // Selected nodes
    {
      selector: "node:selected",
      style: {
        "border-width": 3,
        "border-color": findMatchHighlightBgColor,
        "background-color": selectionHighlightBgColor,
        color: selectionFgColor,
      },
    },
    // Hovered nodes
    {
      selector: "node:active",
      style: {
        "overlay-opacity": 0,
        "border-width": 2,
        "border-color": hoverHighlightBgColor,
      },
    },
    // Compound nodes
    {
      selector: ".compound",
      style: {
        "background-color": inactiveSelectionBgColor,
        shape: "roundrectangle",
        "text-valign": "top",
        "text-halign": "center",
        // "font-weight": "bold",
        "text-wrap": "wrap",
        "text-max-width": "600px",
        "border-width": 2,
        "border-color": editorBorderColor,
        "text-margin-y": 10,
        color: fgColor,
        'visibility': 'visible', // Force visibility
        'display': 'element',    // Force display
      },
    },
    // Parent nodes (compound nodes)
    {
      selector: ":parent",
      style: {
        "background-opacity": 0.5,
        "background-color": gutterBgColor,
      },
    },
  ];

  useEffect(() => {
    if (containerRef.current && elements.length > 0) {
      if (!cyRef.current) {
        const cy = cytoscape({
          container: containerRef.current,
          elements,
          layout: layoutOptions,
          style: styles,
        });
        cyRef.current = cy;

        applyZoomMode(cy, zoomModeRef.current, nodeGroupsRef);

        cy.on("zoom", function () {
          const zoomLevel = cy.zoom();
          const currentZoomMode = zoomModeRef.current;
          const currentNodeGroups = nodeGroupsRef.current;
          console.log("Zoom level", zoomLevel, currentZoomMode);
          const zoomThreshold = 0.45;
          if (zoomLevel < zoomThreshold && currentZoomMode !== "zoomedOut" && (currentNodeGroups || []).length > 0) {
            console.log("Zoom out", zoomLevel);
            setZoomMode("zoomedOut");
            applyZoomMode(cy, "zoomedOut", nodeGroupsRef);
            // cy.layout(zoomLayoutOptions).run();
          } else if (zoomLevel >= zoomThreshold && currentZoomMode !== "zoomedIn") {
            console.log("Zoom in", zoomLevel);
            setZoomMode("zoomedIn");
            applyZoomMode(cy, "zoomedIn", nodeGroupsRef);
            // cy.layout(zoomLayoutOptions).run();
          }
        });

        window.addEventListener("resize", resizeContainer);
        function resizeContainer() {
          containerRef.current!.style.height = window.innerHeight + "px";
          containerRef.current!.style.width = window.innerWidth * screenWidthFraction + "px";
          cy.resize();
          cy.fit();
        }

        cy.on("click", "node", async function (event) {
          const node = event.target;
          const definitionNode = callGraph.definitionNodes[node.id()];
          if (!definitionNode) {
            return;
          }
          await navigateToDoc(definitionNode.document, definitionNode.enclosingRange.startLine);
          cy.animate({
            zoom: 1,
            center: {
              eles: node,
            },
            duration: 200,
            easing: "ease-in-out",
          } as any);
        });
      } else {
        cyRef.current.json({ elements });
        cyRef.current.style().fromJson(styles).update();
        applyZoomMode(cyRef.current, zoomModeRef.current, nodeGroupsRef);
        cyRef.current.layout(layoutOptions).run();
      }
    }
  }, [elements]);

  return (
    <main className="w-full overflow-auto">
      {selectedEntryPoint ? (
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      ) : (
        <div className="text-center text-gray-500">Select an entry point to view the call graph.</div>
      )}
    </main>
  );
};

function applyZoomMode(cy: Core, zoomMode: ZoomMode, nodeGroupsRef: React.MutableRefObject<NodeGroup[] | undefined>) {
  const currentNodeGroups = nodeGroupsRef.current;
  if (zoomMode === "zoomedOut" && (currentNodeGroups || []).length > 0) {
    // Zoomed out: Show only compound nodes and top-level node
    cy.batch(() => {
      // First, show compound nodes and compound edges
      cy.elements(".compound").removeClass("hidden");
      cy.elements(".compound-edge").removeClass("hidden");

      // Then hide regular nodes and edges
      cy.elements(".node").addClass("hidden");
      cy.elements(".top-level-node").addClass("hidden");
      cy.elements(".edge").addClass("hidden");

      // Adjust compound node labels
      cy.elements(".compound").removeClass("hidden-label");
      cy.elements(".compound").style({
        "text-valign": "center",
        "text-halign": "center",
        "font-size": "40px",
        "font-weight": "normal",
        "background-color": selectionBgColor,
        color: selectionFgColor,
      });
    });
  } else if (zoomMode === "zoomedIn") {
    // Zoomed in: Show all nodes
    cy.batch(() => {
      // Show nodes and edges
      cy.elements(".node").removeClass("hidden");
      cy.elements(".top-level-node").removeClass("hidden");
      cy.elements(".edge").removeClass("hidden");

      // Hide compound edges
      cy.elements(".compound-edge").addClass("hidden");

      // Adjust compound node labels
      cy.elements(".compound").style({
        "text-valign": "top",
        "text-halign": "center",
        "font-size": "14px",
        "font-weight": "bold",
        "background-color": selectionBgColor,
        color: selectionFgColor,
      });
    });
  }
}

const generateElements = (
  selectedEntryPoint: DefinitionNode,
  callGraph: CallGraph,
  summaries: Record<string, string>,
  nodeGroups: NodeGroup[] | undefined
): cytoscape.ElementDefinition[] => {
  const elements: cytoscape.ElementDefinition[] = [];
  const visited = new Set<string>();
  const nodesToSkip = findAllNodesToSkip(selectedEntryPoint, callGraph, summaries);

  // Define the mappings
  const compoundIdToGroup: { [compoundId: string]: NodeGroup } = {};
  const symbolToCompoundId: { [symbol: string]: string } = {};

  // Process nodeGroups to populate the mappings
  (nodeGroups || []).forEach((group, index) => {
    const compoundId = `compound_${index}`;
    compoundIdToGroup[compoundId] = group;
    for (const memberSymbol of group.memberSymbols) {
      symbolToCompoundId[memberSymbol] = compoundId;
    }
  });

  // Map to keep track of compound nodes and their connections
  const compoundConnections = new Map<string, Set<string>>();

  // Function to add edges between compound nodes
  const addCompoundEdge = (sourceCompound: string, targetCompound: string) => {
    const edgeId = `compound-edge-${sourceCompound}-${targetCompound}`;
    elements.push({
      data: {
        id: edgeId,
        source: sourceCompound,
        target: targetCompound,
      },
      classes: "compound-edge",
    });
  };

  const addNode = (node: DefinitionNode, isTopLevel: boolean) => {
    if (visited.has(node.symbol)) {
      return;
    }
    visited.add(node.symbol);

    const summary = summaries[node.symbol]?.trimStart() || "";
    const compoundId = symbolToCompoundId[node.symbol] || undefined;

    // Add node
    elements.push({
      data: {
        id: node.symbol,
        label: isTopLevel
          ? `⮕ ${symbolDisplayName(node.symbol)}\n\n${summary}`
          : `${symbolDisplayName(node.symbol)}\n\n${summary}`,
        document: node.document,
        range: node.enclosingRange,
        parent: compoundId,
      },
      classes: isTopLevel ? "top-level-node" : "node",
    });

    for (const child of node.children) {
      if (nodesToSkip.has(child.symbol)) {
        continue;
      }

      // Add edge between nodes
      const edgeId = `${node.symbol}-${child.symbol}`;
      elements.push({
        data: {
          id: edgeId,
          source: node.symbol,
          target: child.symbol,
        },
        classes: "edge",
      });

      // Record compound connections
      const childCompoundId = symbolToCompoundId[child.symbol] || undefined;
      if (compoundId && childCompoundId && compoundId !== childCompoundId) {
        if (!compoundConnections.has(compoundId)) {
          compoundConnections.set(compoundId, new Set());
        }
        compoundConnections.get(compoundId)!.add(childCompoundId);
      }

      if (callGraph.definitionNodes[child.symbol]) {
        addNode(callGraph.definitionNodes[child.symbol], false);
      }
    }
  };

  addNode(selectedEntryPoint, true);

  // Add compound nodes for groups
  for (const [compoundId, group] of Object.entries(compoundIdToGroup)) {
    elements.push({
      data: {
        id: compoundId,
        label: group.description || "",
      },
      classes: "compound",
    });
  }

  // Add edges between compound nodes
  for (const [sourceCompound, targetCompounds] of compoundConnections.entries()) {
    for (const targetCompound of targetCompounds) {
      addCompoundEdge(sourceCompound, targetCompound);
    }
  }

  return elements;
};

const findAllNodesToSkip = (entryPoint: DefinitionNode, callGraph: CallGraph, summaries: Record<string, string>) => {
  const nodesToSkip = new Set<string>();
  const visited = new Set<string>();
  const stack = [entryPoint];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || visited.has(node.symbol)) {
      continue;
    }
    visited.add(node.symbol);
    const summary = summaries[node.symbol].trimStart();
    if (/- None/.test(summary)) {
      nodesToSkip.add(node.symbol);
    }
    for (const child of node.children) {
      if (!visited.has(child.symbol)) {
        stack.push(callGraph.definitionNodes[child.symbol]);
      }
    }
  }
  return nodesToSkip;
};
