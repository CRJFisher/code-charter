import React, { useEffect, useRef, useState } from "react";
import { CallGraph, DefinitionNode, NodeGroup, RefinedSummariesAndFilteredOutNodes } from "../../../shared/codeGraph";
import { navigateToDoc } from "../vscodeApi";

import cytoscape, { Core } from "cytoscape";

import fcose, { FcoseLayoutOptions, FcoseRelativePlacementConstraint } from "cytoscape-fcose";
import { symbolDisplayName } from "../../../shared/symbols";
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
} from "../colorTheme";
import { generateElements, generateRelativePlacementConstraints } from "./nodePlacement";
import { nodeAndEdgeStyles } from "../styles/cytoscapeStyles";

cytoscape.use(fcose);

type ZoomMode = "zoomedIn" | "zoomedOut";

interface CodeChartAreaProps {
  selectedEntryPoint: DefinitionNode | null;
  callGraph: CallGraph;
  nodeGroups: NodeGroup[] | undefined;
  screenWidthFraction: number;
  getSummaries: (nodeSymbol: string) => Promise<RefinedSummariesAndFilteredOutNodes | undefined>;
}

export const CodeChartArea: React.FC<CodeChartAreaProps> = ({
  selectedEntryPoint,
  callGraph,
  nodeGroups,
  screenWidthFraction,
  getSummaries,
}) => {
  const [elements, setElements] = useState<cytoscape.ElementDefinition[]>([]);
  const [nodePlacements, setNodePlacments] = useState<FcoseRelativePlacementConstraint[]>([]);
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
      const placements = generateRelativePlacementConstraints(
        selectedEntryPoint,
        callGraph,
        summaries.filteredOutNodes,
        nodeGroups
      );
      console.log("Placements", placements);
      // validate placements have the same nodes as the elements
      const elementIds = new Set(newElements.map((element) => element.data.id));
      for (const placement of placements) {
        if ("top" in placement && !elementIds.has(placement.top)) {
          console.error(`Placement top node ${placement.top} not found in elements`);
        }
        if ("bottom" in placement && !elementIds.has(placement.bottom)) {
          console.error(`Placement bottom node ${placement.bottom} not found in elements`);
        }
        if ("left" in placement && !elementIds.has(placement.left)) {
          console.error(`Placement left node ${placement.left} not found in elements`);
        }
        if ("right" in placement && !elementIds.has(placement.right)) {
          console.error(`Placement right node ${placement.right} not found in elements`);
        }
      }
      setNodePlacments(placements);
    };
    fetchData();
  }, [selectedEntryPoint, callGraph, nodeGroups]);

  const layoutOptions: FcoseLayoutOptions = {
    name: "fcose",
    animate: true,
    animationDuration: 500,
    animationEasing: "ease-out",
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
    randomize: false, // Keep positioning stable
    relativePlacementConstraint: nodePlacements,
  };

  const zoomLayoutOptions: FcoseLayoutOptions = {
    ...layoutOptions,
    animate: false, // Disable animation to prevent zoom level changes
    fit: false, // Prevent automatic zoom adjustment
  };

  useEffect(() => {
    if (containerRef.current && elements.length > 0) {
      if (!cyRef.current) {
        const cy = cytoscape({
          container: containerRef.current,
          elements,
          layout: layoutOptions,
          style: nodeAndEdgeStyles,
        });
        cyRef.current = cy;

        applyZoomMode(cy, zoomModeRef.current, nodeGroupsRef);

        cy.on("zoom", function () {
          const zoomLevel = cy.zoom();
          const currentZoomMode = zoomModeRef.current;
          const currentNodeGroups = nodeGroupsRef.current;
          const zoomThreshold = 0.45;
          if (zoomLevel < zoomThreshold && currentZoomMode !== "zoomedOut" && (currentNodeGroups || []).length > 0) {
            setZoomMode("zoomedOut");
            applyZoomMode(cy, "zoomedOut", nodeGroupsRef);
            // cy.layout(zoomLayoutOptions).run();
          } else if (zoomLevel >= zoomThreshold && currentZoomMode !== "zoomedIn") {
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
        cyRef.current.style().fromJson(nodeAndEdgeStyles).update();
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

