import React, { useEffect, useRef, useState, useCallback } from "react";
import { CallGraphNode } from "@ariadnejs/core";
import { NodeGroup, TreeAndContextSummaries } from "@code-charter/types";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  useStore,
  ReactFlowState as XYFlowState,
  useReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import { CodeChartNode, CodeChartEdge } from "./react_flow_types";
import "@xyflow/react/dist/style.css";
import { CodeIndexStatus, SummarisationStatus } from "../loading_status";
import { CodeNodeData } from "./code_function_node";
import { symbolDisplayName } from "./symbol_utils";
import { applyHierarchicalLayout, calculateNodeDimensions } from "./elk_layout";
import { zoomAwareNodeTypes } from "./zoom_aware_node";
import { generateReactFlowElements } from "./react_flow_data_transform";
import { LoadingIndicator } from "./loading_indicator";
import { saveGraphState, loadGraphState, exportGraphState, clearGraphState } from "./state_persistence";
import { useKeyboardNavigation, SkipToGraph } from "./keyboard_navigation";
import { useDebounce, useThrottle, getVisibleNodes, PerformanceMonitor } from "./performance_utils";
import { clearLayoutCaches } from "./elk_layout";
import { useVirtualNodes, useZoomCulling, ViewportIndicator } from "./virtual_renderer";

type ZoomMode = "zoomedIn" | "zoomedOut";

interface CodeChartAreaProps {
  selectedEntryPoint: CallGraphNode | null;
  screenWidthFraction: number;
  getSummaries: (nodeSymbol: string) => Promise<TreeAndContextSummaries | undefined>;
  detectModules: () => Promise<NodeGroup[] | undefined>;
  indexingStatus: CodeIndexStatus;
}

// ARIA label configuration for accessibility
const ariaLabelConfig = {
  'node.a11yDescription.default': 'Press Enter to select this node. Use arrow keys to navigate.',
  'node.a11yDescription.keyboardDisabled': 'Keyboard navigation is disabled',
  'edge.a11yDescription.default': 'Connection between functions. Press Enter to focus.',
  'canvas.a11yDescription': 'Code flow visualization canvas. Use Tab to navigate nodes.',
};

const CodeChartAreaReactFlowInner: React.FC<CodeChartAreaProps> = ({
  selectedEntryPoint,
  screenWidthFraction,
  getSummaries,
  detectModules,
  indexingStatus,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<CodeChartNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CodeChartEdge>([]);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("zoomedOut");
  const [callGraphNodes, setCallChart] = useState<Record<string, CallGraphNode> | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<SummarisationStatus>(SummarisationStatus.SummarisingFunctions);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeGroupsRef = useRef<NodeGroup[] | undefined>(undefined);
  const reactFlowInstance = useRef<ReactFlowInstance<CodeChartNode, CodeChartEdge> | null>(null);
  const perfMonitor = useRef(new PerformanceMonitor());
  
  // Use keyboard navigation hook
  const { selectedNodeId } = useKeyboardNavigation({
    onNodeNavigate: (nodeId) => {
      // Auto-pan to the selected node
      if (reactFlowInstance.current) {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          reactFlowInstance.current.setCenter(node.position.x, node.position.y, {
            duration: 300,
            zoom: reactFlowInstance.current.getZoom(),
          });
        }
      }
    },
  });
  
  // Monitor zoom level and viewport
  const zoom = useStore((state: XYFlowState) => state.transform[2]);
  const viewport = useStore((state: XYFlowState) => ({
    x: state.transform[0],
    y: state.transform[1],
    zoom: state.transform[2],
  }));
  const ZOOM_THRESHOLD = 0.45;
  
  // Debounce viewport changes for performance
  const debouncedViewport = useDebounce(viewport, 100);

  // Update zoom mode based on zoom level
  useEffect(() => {
    const newZoomMode = zoom < ZOOM_THRESHOLD ? "zoomedOut" : "zoomedIn";
    if (newZoomMode !== zoomMode) {
      setZoomMode(newZoomMode);
    }
  }, [zoom, zoomMode]);

  // Memoize visible nodes for virtualization
  const visibleNodeIds = useMemo(() => {
    if (!containerRef.current || nodes.length === 0) {
      return new Set<string>();
    }
    
    return getVisibleNodes(
      nodes,
      debouncedViewport,
      containerRef.current.clientWidth,
      containerRef.current.clientHeight
    );
  }, [nodes, debouncedViewport]);
  
  // Apply zoom-based culling for performance
  const culledNodes = useZoomCulling(nodes, zoom, 0.3);
  
  // Apply virtual rendering for large graphs
  const { virtualNodes, virtualEdges, hiddenNodeCount } = useVirtualNodes({
    nodes: nodes.length > 200 ? culledNodes : nodes,
    edges,
    visibleNodeIds: nodes.length > 200 ? visibleNodeIds : new Set(),
    renderBuffer: 25,
  });
  
  // Clear caches when entry point changes
  useEffect(() => {
    if (selectedEntryPoint) {
      clearLayoutCaches();
    }
  }, [selectedEntryPoint?.symbol]);
  
  useEffect(() => {
    if (!selectedEntryPoint) {
      return;
    }

    const fetchData = async () => {
      try {
        setError(null);
        setSummaryStatus(SummarisationStatus.SummarisingFunctions);
        perfMonitor.current.startMeasure('data-fetch');
        
        // Check for saved state first
        const savedState = loadGraphState(selectedEntryPoint.symbol);
        if (savedState) {
          setNodes(savedState.nodes);
          setEdges(savedState.edges);
          // Note: viewport will be set via onInit callback
          setSummaryStatus(SummarisationStatus.Ready);
          return;
        }
        
        const summariesAndFilteredCallTree = await getSummaries(selectedEntryPoint.symbol);
        if (!summariesAndFilteredCallTree) {
          throw new Error("Failed to load function summaries");
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
        perfMonitor.current.endMeasure('data-fetch', nodes.length, edges.length);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setSummaryStatus(SummarisationStatus.Error);
      }
    };
    
    fetchData();
  }, [selectedEntryPoint, getSummaries, detectModules, setNodes, setEdges]);

  const getVisibilityClassNames = (show: boolean): string => {
    return show ? "visible" : "invisible";
  };
  
  // Throttle save operations for performance
  const handleSaveState = useThrottle(useCallback((reactFlowInstance: ReactFlowInstance<CodeChartNode, CodeChartEdge>) => {
    if (!selectedEntryPoint || !reactFlowInstance) return;
    
    const viewport = reactFlowInstance.getViewport();
    saveGraphState(nodes, edges, viewport, selectedEntryPoint.symbol);
  }, [nodes, edges, selectedEntryPoint]), 1000);
  
  // Export state to file
  const handleExportState = useCallback((reactFlowInstance: ReactFlowInstance<CodeChartNode, CodeChartEdge>) => {
    if (!selectedEntryPoint || !reactFlowInstance) return;
    
    const viewport = reactFlowInstance.getViewport();
    exportGraphState(nodes, edges, viewport, selectedEntryPoint.symbol);
  }, [nodes, edges, selectedEntryPoint]);
  
  // Handle React Flow initialization
  const onInit = useCallback((instance: ReactFlowInstance<CodeChartNode, CodeChartEdge>) => {
    if (!selectedEntryPoint) return;
    
    reactFlowInstance.current = instance;
    
    // Check for saved viewport
    const savedState = loadGraphState(selectedEntryPoint.symbol);
    if (savedState?.viewport) {
      instance.setViewport(savedState.viewport);
    }
  }, [selectedEntryPoint]);

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
        <LoadingIndicator 
          status="Indexing Code"
          message="Parsing your codebase to build the call graph..."
        />
      </div>
    );
  }

  const showElements = selectedEntryPoint !== null && summaryStatus === SummarisationStatus.Ready;

  return (
    <>
      <SkipToGraph />
      <div
        ref={containerRef}
        className="chart-container"
        style={{
          width: `${screenWidthFraction * 100}%`,
          height: "100vh",
          position: "relative",
        }}
        id="code-flow-graph"
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
        {summaryStatus === SummarisationStatus.SummarisingFunctions && (
          <LoadingIndicator 
            status="Summarizing Functions"
            message="Generating AI summaries for each function..."
          />
        )}
        {summaryStatus === SummarisationStatus.DetectingModules && (
          <LoadingIndicator 
            status="Detecting Modules"
            message="Analyzing code structure to identify logical modules..."
          />
        )}
        {summaryStatus === SummarisationStatus.Error && error && (
          <div style={{
            padding: "20px",
            backgroundColor: "#fee",
            border: "1px solid #fcc",
            borderRadius: "4px",
            color: "#c00",
            maxWidth: "400px",
          }}>
            <div style={{ fontWeight: "bold", marginBottom: "8px" }}>Error</div>
            <div>{error}</div>
          </div>
        )}
      </div>
      
      <div className={getVisibilityClassNames(showElements)} style={{ width: "100%", height: "100%" }}>
        <ReactFlow
          nodes={virtualNodes}
          edges={virtualEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={zoomAwareNodeTypes}
          fitView
          fitViewOptions={{
            padding: 0.2,
            duration: 500,
          }}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
          nodesFocusable={true}
          edgesFocusable={true}
          autoPanOnNodeFocus={true}
          ariaLabelConfig={ariaLabelConfig}
          onlyRenderVisibleElements={true}
          minZoom={0.1}
          maxZoom={2.5}
          defaultEdgeOptions={{
            animated: true,
            style: {
              stroke: '#b1b1b7',
              strokeWidth: 2,
            },
            ariaLabel: 'Function call',
          }}
          onInit={onInit}
          onNodeDragStop={() => {
            // Auto-save on node position change
            setTimeout(() => {
              if (reactFlowInstance.current) {
                handleSaveState(reactFlowInstance.current);
              }
            }, 100);
          }}
          aria-label="Code flow diagram showing function calls and dependencies"
          role="application"
        >
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          <Controls />
          
          {/* Zoom mode indicator and controls */}
          <div
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              zIndex: 5,
            }}
          >
            <div
              style={{
                padding: "5px 10px",
                backgroundColor: "rgba(255, 255, 255, 0.9)",
                border: "1px solid #ddd",
                borderRadius: "4px",
                fontSize: "12px",
                color: "#666",
              }}
            >
              {zoomMode === "zoomedOut" ? "Module View" : "Function View"}
            </div>
            
            {/* Performance info */}
            {nodes.length > 100 && (
              <div
                style={{
                  padding: "4px 8px",
                  backgroundColor: "rgba(255, 255, 255, 0.9)",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  fontSize: "11px",
                  color: "#666",
                  marginBottom: "4px",
                }}
              >
                {nodes.length} nodes • {virtualNodes.length} rendered • {hiddenNodeCount} hidden
              </div>
            )}
            
            {/* Show indicators for hidden nodes */}
            {hiddenNodeCount > 50 && (
              <ViewportIndicator 
                direction="top" 
                count={Math.floor(hiddenNodeCount / 4)}
                onClick={() => {
                  if (reactFlowInstance.current) {
                    reactFlowInstance.current.fitView({ padding: 0.2 });
                  }
                }}
              />
            )}
            
            {/* Persistence controls */}
            <div
              style={{
                display: "flex",
                gap: "4px",
              }}
            >
              <button
                onClick={() => {
                  if (reactFlowInstance.current) {
                    handleSaveState(reactFlowInstance.current);
                    alert("Graph state saved!");
                  }
                }}
                style={{
                  padding: "4px 8px",
                  fontSize: "11px",
                  backgroundColor: "#4CAF50",
                  color: "white",
                  border: "none",
                  borderRadius: "3px",
                  cursor: "pointer",
                }}
              >
                Save
              </button>
              <button
                onClick={() => {
                  if (reactFlowInstance.current) {
                    handleExportState(reactFlowInstance.current);
                  }
                }}
                style={{
                  padding: "4px 8px",
                  fontSize: "11px",
                  backgroundColor: "#2196F3",
                  color: "white",
                  border: "none",
                  borderRadius: "3px",
                  cursor: "pointer",
                }}
              >
                Export
              </button>
              <button
                onClick={() => {
                  if (confirm("Clear saved state?")) {
                    clearGraphState();
                    alert("Saved state cleared!");
                  }
                }}
                style={{
                  padding: "4px 8px",
                  fontSize: "11px",
                  backgroundColor: "#f44336",
                  color: "white",
                  border: "none",
                  borderRadius: "3px",
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </ReactFlow>
      </div>
    </div>
    </>
  );
};

// Export the component with proper naming
export const CodeChartAreaReactFlow = CodeChartAreaReactFlowInner;

// Wrap the component with ReactFlowProvider
export const CodeChartAreaReactFlowWrapper: React.FC<CodeChartAreaProps> = (props) => {
  return (
    <ReactFlowProvider>
      <CodeChartAreaReactFlowInner {...props} />
    </ReactFlowProvider>
  );
};