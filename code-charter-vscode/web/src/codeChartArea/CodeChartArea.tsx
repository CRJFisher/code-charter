import React, { useEffect, useRef, useState } from "react";
import { CallGraphNode } from "refscope-types";
import type { NodeGroup, TreeAndContextSummaries } from "../vscodeApi";
import { navigateToDoc } from "../vscodeApi";

import cytoscape, { Core } from "cytoscape";

import fcose, { FcoseLayoutOptions, FcoseRelativePlacementConstraint } from "cytoscape-fcose";
import { selectionBgColor, selectionFgColor } from "../colorTheme";
import { generateElements, generateRelativePlacementConstraints } from "./nodePlacement";
import { nodeAndEdgeStyles } from "../styles/cytoscapeStyles";
import { CodeIndexStatus, SummarisationStatus } from "../loadingStatus";
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";

cytoscape.use(fcose);

type ZoomMode = "zoomedIn" | "zoomedOut";

interface CodeChartAreaProps {
  selectedEntryPoint: CallGraphNode | null;
  screenWidthFraction: number;
  getSummaries: (nodeSymbol: string) => Promise<TreeAndContextSummaries | undefined>;
  detectModules: () => Promise<NodeGroup[] | undefined>;
  indexingStatus: CodeIndexStatus;
}

export const CodeChartArea: React.FC<CodeChartAreaProps> = ({
  selectedEntryPoint,
  screenWidthFraction,
  getSummaries,
  detectModules,
  indexingStatus,
}) => {
  const [elements, setElements] = useState<cytoscape.ElementDefinition[]>([]);
  const [nodePlacements, setNodePlacments] = useState<FcoseRelativePlacementConstraint[]>([]);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("zoomedOut");
  const [callGraphNodes, setCallChart] = useState<Record<string, CallGraphNode> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomModeRef = useRef<ZoomMode>(zoomMode);
  const nodeGroupsRef = useRef<NodeGroup[] | undefined>(undefined);
  const cyRef = useRef<Core | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<SummarisationStatus>(SummarisationStatus.SummarisingFunctions);

  useEffect(() => {
    zoomModeRef.current = zoomMode;
  }, [zoomMode]);

  useEffect(() => {
    if (!selectedEntryPoint) {
      return;
    }
    if (cyRef.current) {
      try {
        cyRef.current.destroy(); // Safely destroy
      } catch (error) {
        console.error("Error destroying Cytoscape instance:", error);
      } finally {
        cyRef.current = null; // Ensure it's reset
      }
    }
    const fetchData = async () => {
      setSummaryStatus(SummarisationStatus.SummarisingFunctions);
      const summariesAndFilteredCallTree = await getSummaries(selectedEntryPoint.symbol);
      if (!summariesAndFilteredCallTree) {
        return;
      }
      setCallChart(summariesAndFilteredCallTree.callTreeWithFilteredOutNodes);
      // TODO: if node count is less than 10, skip clustering and use dagre layout
      // const totalNodes = Object.keys(summariesAndFilteredCallTree.callTreeWithFilteredOutNodes).length;
      // if (totalNodes < 10) {
      //   cytoscape.use('dagre');
      // }
      setSummaryStatus(SummarisationStatus.DetectingModules);
      const nodeGroups = await detectModules();
      nodeGroupsRef.current = nodeGroups;
      const entryPointInFilteredTree =
        summariesAndFilteredCallTree.callTreeWithFilteredOutNodes[selectedEntryPoint.symbol];
      const newElements = generateElements(entryPointInFilteredTree, summariesAndFilteredCallTree, nodeGroups);
      setElements(newElements);
      const placements = generateRelativePlacementConstraints(
        entryPointInFilteredTree,
        summariesAndFilteredCallTree,
        nodeGroups
      );
      setNodePlacments(placements);
      setSummaryStatus(SummarisationStatus.Ready);
    };
    fetchData();
  }, [selectedEntryPoint]);

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
          const definitionNode = callGraphNodes ? callGraphNodes[node.id()] : null;
          if (!definitionNode) {
            return;
          }
          await navigateToDoc(definitionNode.definition.file_path, definitionNode.definition.range.start.row);
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

  let statusMessage: string | null = null;
  if (indexingStatus !== CodeIndexStatus.Ready) {
    statusMessage = "Indexing...";
  } else if (summaryStatus !== SummarisationStatus.Ready) {
    if (summaryStatus === SummarisationStatus.SummarisingFunctions) {
      statusMessage = "Summarising functions...";
    } else if (summaryStatus === SummarisationStatus.DetectingModules) {
      statusMessage = "Detecting modules...";
    }
  }

  return (
    <main className="w-full overflow-auto">
      {selectedEntryPoint ? (
        <div ref={containerRef} className="flex-grow w-full h-full">
          {statusMessage && (
            <>
              <div className="p-4 text-center">
                {statusMessage}
                <br></br>
              </div>
              <div className="flex justify-center items-center">
                <VSCodeProgressRing />
              </div>
            </>
          )}
        </div>
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
