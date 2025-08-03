import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
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
  MiniMap,
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
import { SearchPanel } from "./search_panel";
import { ErrorBoundary } from "./error_boundary";
import { ErrorNotifications, useErrorNotification } from "./error_notifications";
import { handleReactFlowError, errorLogger } from "./error_handling";
import { CONFIG } from "./config";

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
  const [showMiniMap, setShowMiniMap] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeGroupsRef = useRef<NodeGroup[] | undefined>(undefined);
  const reactFlowInstance = useRef<ReactFlowInstance<CodeChartNode, CodeChartEdge> | null>(null);
  const perfMonitor = useRef(new PerformanceMonitor());
  const { notify } = useErrorNotification();
  
  // Use keyboard navigation hook
  const { selectedNodeId } = useKeyboardNavigation({
    onNodeNavigate: (nodeId) => {
      // Auto-pan to the selected node
      if (reactFlowInstance.current) {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          reactFlowInstance.current.setCenter(node.position.x, node.position.y, {
            duration: CONFIG.animation.duration.panToNode,
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
  const ZOOM_THRESHOLD = CONFIG.zoom.levels.threshold;
  
  // Debounce viewport changes for performance
  const debouncedViewport = useDebounce(viewport, CONFIG.animation.debounce.viewport);

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
  const culledNodes = useZoomCulling(nodes, zoom, CONFIG.zoom.culling.threshold);
  
  // Apply virtual rendering for large graphs
  const { virtualNodes, virtualEdges, hiddenNodeCount } = useVirtualNodes({
    nodes: nodes.length > CONFIG.performance.nodes.largeGraph ? culledNodes : nodes,
    edges,
    visibleNodeIds: nodes.length > CONFIG.performance.nodes.largeGraph ? visibleNodeIds : new Set(),
    renderBuffer: CONFIG.performance.virtualRender.renderBuffer,
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
        const error = err instanceof Error ? err : new Error("An error occurred");
        setError(error.message);
        setSummaryStatus(SummarisationStatus.Error);
        errorLogger.log(error, 'error', { entryPoint: selectedEntryPoint.symbol });
        handleReactFlowError(error);
        
        // Show notification with retry option
        notify(
          'Failed to load visualization data',
          'error',
          [
            { label: 'Retry', action: () => fetchData() },
            { label: 'Dismiss', action: () => {} },
          ]
        );
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
  }, [nodes, edges, selectedEntryPoint]), CONFIG.animation.debounce.save);
  
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
          zIndex: CONFIG.zIndex.overlay,
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
            padding: CONFIG.viewport.fitView.padding,
            duration: CONFIG.animation.duration.fitView,
          }}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
          nodesFocusable={true}
          edgesFocusable={true}
          autoPanOnNodeFocus={true}
          ariaLabelConfig={ariaLabelConfig}
          onlyRenderVisibleElements={true}
          minZoom={CONFIG.zoom.levels.min}
          maxZoom={CONFIG.zoom.levels.max}
          defaultEdgeOptions={{
            animated: true,
            style: {
              stroke: CONFIG.color.edge.stroke,
              strokeWidth: CONFIG.color.edge.strokeWidth,
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
            }, CONFIG.animation.duration.saveDelay);
          }}
          aria-label="Code flow diagram showing function calls and dependencies"
          role="application"
        >
          <Background variant={BackgroundVariant.Dots} gap={CONFIG.background.gap} size={CONFIG.background.size} />
          <Controls />
          
          {/* Mini Map */}
          {showMiniMap && (
            <MiniMap 
              nodeColor={miniMapNodeColor}
              nodeStrokeWidth={CONFIG.minimap.nodeStrokeWidth}
              pannable
              zoomable
              style={{
                backgroundColor: CONFIG.color.ui.background.minimap,
                border: `1px solid ${CONFIG.color.ui.border}`,
              }}
            />
          )}
          
          {/* Search Panel */}
          <SearchPanel 
            onNodeSelect={(nodeId) => {
              // Additional handling if needed when node is selected
              console.log('Node selected:', nodeId);
            }}
          />
          
          {/* Zoom mode indicator and controls */}
          <div
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              zIndex: CONFIG.zIndex.controls,
            }}
          >
            <div
              style={{
                padding: "5px 10px",
                backgroundColor: CONFIG.color.ui.background.overlay,
                border: `1px solid ${CONFIG.color.ui.border}`,
                borderRadius: `${CONFIG.spacing.borderRadius.medium}px`,
                fontSize: `${CONFIG.spacing.fontSize.medium}px`,
                color: CONFIG.color.ui.text.secondary,
              }}
            >
              {zoomMode === "zoomedOut" ? "Module View" : "Function View"}
            </div>
            
            {/* Performance info */}
            {nodes.length > CONFIG.performance.nodes.showStats && (
              <div
                style={{
                  padding: "4px 8px",
                  backgroundColor: CONFIG.color.ui.background.overlay,
                  border: `1px solid ${CONFIG.color.ui.border}`,
                  borderRadius: `${CONFIG.spacing.borderRadius.medium}px`,
                  fontSize: `${CONFIG.spacing.fontSize.small}px`,
                  color: CONFIG.color.ui.text.secondary,
                  marginBottom: `${CONFIG.spacing.margin.small}px`,
                }}
              >
                {nodes.length} nodes • {virtualNodes.length} rendered • {hiddenNodeCount} hidden
              </div>
            )}
            
            {/* Show indicators for hidden nodes */}
            {hiddenNodeCount > CONFIG.performance.nodes.hideIndicator && (
              <ViewportIndicator 
                direction="top" 
                count={Math.floor(hiddenNodeCount / 4)}
                onClick={() => {
                  if (reactFlowInstance.current) {
                    reactFlowInstance.current.fitView({ padding: CONFIG.viewport.fitView.padding });
                  }
                }}
              />
            )}
            
            {/* MiniMap Toggle */}
            <button
              onClick={() => setShowMiniMap(!showMiniMap)}
              style={{
                padding: `${CONFIG.spacing.padding.small}px ${CONFIG.spacing.padding.medium}px`,
                fontSize: `${CONFIG.spacing.fontSize.small}px`,
                backgroundColor: showMiniMap ? CONFIG.color.ui.button.primary : CONFIG.color.ui.button.disabled,
                color: CONFIG.color.ui.text.white,
                border: "none",
                borderRadius: `${CONFIG.spacing.borderRadius.small}px`,
                cursor: "pointer",
                marginBottom: `${CONFIG.spacing.margin.small}px`,
              }}
              aria-label={showMiniMap ? "Hide mini-map" : "Show mini-map"}
            >
              {showMiniMap ? "🗺️ Hide Map" : "🗺️ Show Map"}
            </button>
            
            {/* Persistence controls */}
            <div
              style={{
                display: "flex",
                gap: `${CONFIG.spacing.margin.small}px`,
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
                  padding: `${CONFIG.spacing.padding.small}px ${CONFIG.spacing.padding.medium}px`,
                  fontSize: `${CONFIG.spacing.fontSize.small}px`,
                  backgroundColor: CONFIG.color.ui.button.primary,
                  color: CONFIG.color.ui.text.white,
                  border: "none",
                  borderRadius: `${CONFIG.spacing.borderRadius.small}px`,
                  cursor: "pointer`,
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
                  padding: `${CONFIG.spacing.padding.small}px ${CONFIG.spacing.padding.medium}px`,
                  fontSize: `${CONFIG.spacing.fontSize.small}px`,
                  backgroundColor: CONFIG.color.ui.button.secondary,
                  color: CONFIG.color.ui.text.white,
                  border: "none",
                  borderRadius: `${CONFIG.spacing.borderRadius.small}px`,
                  cursor: "pointer`,
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
                  padding: `${CONFIG.spacing.padding.small}px ${CONFIG.spacing.padding.medium}px`,
                  fontSize: `${CONFIG.spacing.fontSize.small}px`,
                  backgroundColor: CONFIG.color.ui.button.danger,
                  color: CONFIG.color.ui.text.white,
                  border: "none",
                  borderRadius: `${CONFIG.spacing.borderRadius.small}px`,
                  cursor: "pointer`,
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

// MiniMap node color function
function miniMapNodeColor(node: CodeChartNode): string {
  if (node.type === 'module_group') {
    return CONFIG.minimap.colors.moduleGroup;
  }
  if (node.data?.is_entry_point) {
    return CONFIG.minimap.colors.entryPoint;
  }
  if (node.selected) {
    return CONFIG.minimap.colors.selected;
  }
  return CONFIG.minimap.colors.default;
}

// Export the component with proper naming
export const CodeChartAreaReactFlow = CodeChartAreaReactFlowInner;

// Wrap the component with ReactFlowProvider and ErrorBoundary
export const CodeChartAreaReactFlowWrapper: React.FC<CodeChartAreaProps> = (props) => {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        errorLogger.log(error, 'critical', { errorInfo });
        handleReactFlowError(error);
      }}
      maxRetries={CONFIG.error.retry.maxRetries}
    >
      <ReactFlowProvider>
        <CodeChartAreaReactFlowInner {...props} />
        <ErrorNotifications position="bottom" maxNotifications={CONFIG.error.notifications.maxNotifications} />
      </ReactFlowProvider>
    </ErrorBoundary>
  );
};