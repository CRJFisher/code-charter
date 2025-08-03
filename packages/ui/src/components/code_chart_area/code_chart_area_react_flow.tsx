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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CodeIndexStatus, SummarisationStatus } from "../loading_status";
import { nodeTypes, CodeNodeData } from "./code_function_node";
import { symbolDisplayName } from "./symbol_utils";
import { applyHierarchicalLayout, calculateNodeDimensions } from "./elk_layout";

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
      
      // Create initial node with custom type
      const function_name = symbolDisplayName(selectedEntryPoint.symbol);
      const summary = summariesAndFilteredCallTree.summaries?.[selectedEntryPoint.symbol] || "";
      
      const initialNode: Node<CodeNodeData> = {
        id: selectedEntryPoint.symbol,
        type: "code_function",
        position: { x: 100, y: 100 },
        data: { 
          function_name,
          summary,
          file_path: selectedEntryPoint.definition.file_path,
          line_number: selectedEntryPoint.definition.range.start.row,
          is_entry_point: true,
          symbol: selectedEntryPoint.symbol,
        },
      };
      
      // Calculate node dimensions
      const dimensions = calculateNodeDimensions(initialNode);
      initialNode.width = dimensions.width;
      initialNode.height = dimensions.height;
      
      // Apply hierarchical layout
      const layoutedNodes = await applyHierarchicalLayout([initialNode], []);
      
      setNodes(layoutedNodes);
      setEdges([]);
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
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{
            padding: 0.2,
            duration: 500,
          }}
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