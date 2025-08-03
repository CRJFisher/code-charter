import React, { useEffect, useRef, useState, useCallback } from "react";
import { CallGraphNode } from "@ariadnejs/core";
import { NodeGroup, TreeAndContextSummaries } from "@code-charter/types";
import {
  ReactFlow,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  useStore,
  ReactFlowState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CodeIndexStatus, SummarisationStatus } from "../loading_status";
import { CodeNodeData } from "./code_function_node";
import { symbolDisplayName } from "./symbol_utils";
import { applyHierarchicalLayout, calculateNodeDimensions } from "./elk_layout";
import { zoomAwareNodeTypes } from "./zoom_aware_node";
import { generateReactFlowElements } from "./react_flow_data_transform";

type ZoomMode = "zoomedIn" | "zoomedOut";

interface CodeChartAreaProps {
  selectedEntryPoint: CallGraphNode | null;
  screenWidthFraction: number;
  getSummaries: (nodeSymbol: string) => Promise<TreeAndContextSummaries | undefined>;
  detectModules: () => Promise<NodeGroup[] | undefined>;
  indexingStatus: CodeIndexStatus;
}

export const CodeChartAreaReactFlow: React.FC<CodeChartAreaProps> = ({
  selectedEntryPoint,
  screenWidthFraction,
  getSummaries,
  detectModules,
  indexingStatus,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("zoomedOut");
  const [callGraphNodes, setCallChart] = useState<Record<string, CallGraphNode> | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<SummarisationStatus>(SummarisationStatus.SummarisingFunctions);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeGroupsRef = useRef<NodeGroup[] | undefined>(undefined);
  
  // Monitor zoom level
  const zoom = useStore((state: ReactFlowState) => state.transform[2]);
  const ZOOM_THRESHOLD = 0.45;

  // Update zoom mode based on zoom level
  useEffect(() => {
    const newZoomMode = zoom < ZOOM_THRESHOLD ? "zoomedOut" : "zoomedIn";
    if (newZoomMode !== zoomMode) {
      setZoomMode(newZoomMode);
    }
  }, [zoom, zoomMode]);

  useEffect(() => {
    if (!selectedEntryPoint) {
      return;
    }

    const fetchData = async () => {
      setSummaryStatus(SummarisationStatus.SummarisingFunctions);
      const summariesAndFilteredCallTree = await getSummaries(selectedEntryPoint.symbol);
      if (!summariesAndFilteredCallTree) {
        return;
      }
      setCallChart(summariesAndFilteredCallTree.callTreeWithFilteredOutNodes);
      
      setSummaryStatus(SummarisationStatus.DetectingModules);
      const nodeGroups = await detectModules();
      nodeGroupsRef.current = nodeGroups;
      
      // Generate all nodes and edges from the call tree
      const { nodes: flowNodes, edges: flowEdges } = generateReactFlowElements(
        selectedEntryPoint,
        summariesAndFilteredCallTree,
        nodeGroups
      );
      
      // Apply hierarchical layout
      const layoutedNodes = await applyHierarchicalLayout(flowNodes, flowEdges);
      
      setNodes(layoutedNodes);
      setEdges(flowEdges);
      setSummaryStatus(SummarisationStatus.Ready);
    };
    
    fetchData();
  }, [selectedEntryPoint, getSummaries, detectModules, setNodes, setEdges]);

  const getVisibilityClassNames = (show: boolean): string => {
    return show ? "visible" : "invisible";
  };

  if (indexingStatus !== CodeIndexStatus.Ready) {
    return (
      <div
        className="chart-container"
        style={{
          width: `${screenWidthFraction * 100}%`,
          height: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div className="loading-content" style={{ textAlign: "center" }}>
          <div className="loading-spinner">Loading...</div>
          <p style={{ marginTop: "16px" }}>Indexing...</p>
        </div>
      </div>
    );
  }

  const showElements = selectedEntryPoint !== null && summaryStatus === SummarisationStatus.Ready;

  return (
    <div
      ref={containerRef}
      className="chart-container"
      style={{
        width: `${screenWidthFraction * 100}%`,
        height: "100vh",
        position: "relative",
      }}
    >
      <div
        className={`loading-container ${getVisibilityClassNames(summaryStatus !== SummarisationStatus.Ready)}`}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          zIndex: 10,
        }}
      >
        <div className="loading-spinner">Loading...</div>
        <p style={{ marginTop: "16px" }}>
          {summaryStatus === SummarisationStatus.SummarisingFunctions && "Summarising functions..."}
          {summaryStatus === SummarisationStatus.DetectingModules && "Detecting modules..."}
        </p>
      </div>
      
      <div className={getVisibilityClassNames(showElements)} style={{ width: "100%", height: "100%" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={zoomAwareNodeTypes}
          fitView
          fitViewOptions={{
            padding: 0.2,
            duration: 500,
          }}
          nodesDraggable={false}
          defaultEdgeOptions={{
            animated: true,
            style: {
              stroke: '#b1b1b7',
              strokeWidth: 2,
            },
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          <Controls />
          
          {/* Zoom mode indicator */}
          <div
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              padding: "5px 10px",
              backgroundColor: "rgba(255, 255, 255, 0.9)",
              border: "1px solid #ddd",
              borderRadius: "4px",
              fontSize: "12px",
              color: "#666",
              zIndex: 5,
            }}
          >
            {zoomMode === "zoomedOut" ? "Module View" : "Function View"}
          </div>
        </ReactFlow>
      </div>
    </div>
  );
};

// Wrap the component with ReactFlowProvider
export const CodeChartAreaReactFlowWrapper: React.FC<CodeChartAreaProps> = (props) => {
  return (
    <ReactFlowProvider>
      <CodeChartAreaReactFlow {...props} />
    </ReactFlowProvider>
  );
};