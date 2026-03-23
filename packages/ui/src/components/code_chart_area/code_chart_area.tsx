import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { CallableNode } from "@code-charter/types";
import { NodeGroup, DocstringSummaries } from "@code-charter/types";
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
  type ReactFlowInstance,
  MiniMap,
} from "@xyflow/react";
import { CodeChartNode, CodeChartEdge } from "./chart_types";
import "@xyflow/react/dist/style.css";

import { CodeIndexStatus, DescriptionStatus } from "../loading_status";
import { applyHierarchicalLayout } from "./graph_layout";
import { zoomAwareNodeTypes } from "./chart_node_types";
import { generateReactFlowElements } from "./call_tree_to_graph";
import { LoadingIndicator } from "./loading_indicator";
import { saveGraphState, loadGraphState, exportGraphState, clearGraphState } from "./state_persistence";
import { useKeyboardNavigation, SkipToGraph } from "./keyboard_navigation";
import { useDebounce } from "../../hooks/use_debounce";
import { useThrottle } from "../../hooks/use_throttle";
import { getVisibleNodes } from "./virtual_renderer";
import { clearLayoutCaches } from "./graph_layout";
import { useVirtualNodes, useZoomCulling, ViewportIndicator } from "./virtual_renderer";
import { SearchPanel } from "./search_panel";
import { ErrorBoundary } from "../../error/error_boundary";
import { ErrorNotifications, useErrorNotification } from "../../error/error_notifications";
import { handleReactFlowError, errorLogger } from "./error_handling";
import { CONFIG } from "./chart_config";
import { useFlowThemeStyles } from "./use_chart_theme_styles";

type ZoomMode = "zoomedIn" | "zoomedOut";

interface CodeChartAreaProps {
  selectedEntryPoint: CallableNode | null;
  screenWidthFraction: number;
  getDescriptions: (nodeSymbol: string) => Promise<DocstringSummaries | undefined>;
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
  getDescriptions,
  detectModules,
  indexingStatus,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<CodeChartNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CodeChartEdge>([]);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("zoomedOut");
  const [, setCallChart] = useState<Record<string, CallableNode> | null>(null);
  const [description_status, set_description_status] = useState<DescriptionStatus>(DescriptionStatus.LoadingDescriptions);
  const [error, setError] = useState<string | null>(null);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeGroupsRef = useRef<NodeGroup[] | undefined>(undefined);
  const reactFlowInstance = useRef<ReactFlowInstance<CodeChartNode, CodeChartEdge> | null>(null);
  const { notify } = useErrorNotification();
  const themeStyles = useFlowThemeStyles();
  const miniMapNodeColor = useMemo(() => createMiniMapNodeColor(themeStyles.colors), [themeStyles.colors]);

  // Use keyboard navigation hook
  useKeyboardNavigation({
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
  const viewportX = useStore((state: XYFlowState) => state.transform[0]);
  const viewportY = useStore((state: XYFlowState) => state.transform[1]);
  const viewportZoom = useStore((state: XYFlowState) => state.transform[2]);
  const viewport = useMemo(() => ({ x: viewportX, y: viewportY, zoom: viewportZoom }), [viewportX, viewportY, viewportZoom]);
  const ZOOM_THRESHOLD = CONFIG.zoom.levels.threshold;

  // Debounce viewport changes for performance
  const debouncedViewport = useDebounce(viewport, CONFIG.animation.debounce.viewport);

  // Update zoom mode based on zoom level
  useEffect(() => {
    const newZoomMode = viewportZoom < ZOOM_THRESHOLD ? "zoomedOut" : "zoomedIn";
    if (newZoomMode !== zoomMode) {
      setZoomMode(newZoomMode);
    }
  }, [viewportZoom, zoomMode]);

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
  const culledNodes = useZoomCulling(nodes, viewportZoom, CONFIG.zoom.culling.threshold);

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
  }, [selectedEntryPoint?.symbol_id]);

  useEffect(() => {
    if (!selectedEntryPoint) {
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      try {
        setError(null);
        set_description_status(DescriptionStatus.LoadingDescriptions);

        // Check for saved state first
        const savedState = loadGraphState(selectedEntryPoint.symbol_id);
        if (savedState) {
          if (cancelled) return;
          setNodes(savedState.nodes);
          setEdges(savedState.edges);
          set_description_status(DescriptionStatus.Ready);
          return;
        }

        const docstring_summaries = await getDescriptions(selectedEntryPoint.symbol_id);
        if (cancelled) return;
        if (!docstring_summaries) {
          throw new Error("Failed to load code tree descriptions");
        }
        setCallChart(docstring_summaries.call_tree);

        set_description_status(DescriptionStatus.DetectingModules);
        const nodeGroups = await detectModules();
        if (cancelled) return;
        nodeGroupsRef.current = nodeGroups;

        // Generate all nodes and edges from the call tree
        const { nodes: flowNodes, edges: flowEdges } = generateReactFlowElements(
          selectedEntryPoint,
          docstring_summaries,
          nodeGroups,
          themeStyles.colors.cluster?.palette
        );

        // Apply hierarchical layout
        const layoutedNodes = await applyHierarchicalLayout(flowNodes, flowEdges);
        if (cancelled) return;

        setNodes(layoutedNodes);
        setEdges(flowEdges);
        set_description_status(DescriptionStatus.Ready);
      } catch (err) {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error("An error occurred");
        setError(error.message);
        set_description_status(DescriptionStatus.Error);
        errorLogger.log(error, 'error', { entryPoint: selectedEntryPoint.symbol_id });
        handleReactFlowError(error);

        // Show notification with retry option
        notify(
          'Failed to load visualization data',
          'error',
          [
            { label: 'Retry', action: () => fetchData() },
            { label: 'Dismiss', action: () => undefined },
          ]
        );
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [selectedEntryPoint, getDescriptions, detectModules, setNodes, setEdges]);

  const getVisibilityClassNames = (show: boolean): string => {
    return show ? "visible" : "invisible";
  };

  // Throttle save operations for performance
  const handleSaveState = useThrottle(useCallback((reactFlowInstance: ReactFlowInstance<CodeChartNode, CodeChartEdge>) => {
    if (!selectedEntryPoint || !reactFlowInstance) return;

    const viewport = reactFlowInstance.getViewport();
    saveGraphState(nodes, edges, viewport, selectedEntryPoint.symbol_id);
  }, [nodes, edges, selectedEntryPoint]), CONFIG.animation.debounce.save);

  // Export state to file
  const handleExportState = useCallback((reactFlowInstance: ReactFlowInstance<CodeChartNode, CodeChartEdge>) => {
    if (!selectedEntryPoint || !reactFlowInstance) return;

    const viewport = reactFlowInstance.getViewport();
    exportGraphState(nodes, edges, viewport, selectedEntryPoint.symbol_id);
  }, [nodes, edges, selectedEntryPoint]);

  // Handle React Flow initialization
  const onInit = useCallback((instance: ReactFlowInstance<CodeChartNode, CodeChartEdge>) => {
    if (!selectedEntryPoint) return;

    reactFlowInstance.current = instance;

    // Check for saved viewport
    const savedState = loadGraphState(selectedEntryPoint.symbol_id);
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

  const showElements = selectedEntryPoint !== null && description_status === DescriptionStatus.Ready;

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
        className={`loading-container ${getVisibilityClassNames(description_status !== DescriptionStatus.Ready)}`}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          zIndex: CONFIG.zIndex.overlay,
        }}
      >
        {description_status === DescriptionStatus.LoadingDescriptions && (
          <LoadingIndicator
            status="Loading Descriptions"
            message="Extracting docstrings from source code..."
          />
        )}
        {description_status === DescriptionStatus.DetectingModules && (
          <LoadingIndicator
            status="Detecting Modules"
            message="Analyzing code structure to identify logical modules..."
          />
        )}
        {description_status === DescriptionStatus.Error && error && (
          <div style={{
            padding: "20px",
            ...themeStyles.getErrorStyle(),
            borderRadius: "4px",
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
            style: themeStyles.getEdgeStyle(false),
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
          <Background
            variant={BackgroundVariant.Dots}
            gap={CONFIG.background.gap}
            size={CONFIG.background.size}
            color={themeStyles.colors.background.dots}
          />
          <Controls />

          {/* Mini Map */}
          {showMiniMap && (
            <MiniMap
              nodeColor={miniMapNodeColor}
              nodeStrokeWidth={CONFIG.minimap.nodeStrokeWidth}
              pannable
              zoomable
              style={{
                backgroundColor: themeStyles.colors.ui.background.minimap,
                border: `1px solid ${themeStyles.colors.ui.border}`,
              }}
            />
          )}

          {/* Search Panel */}
          <SearchPanel />

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
                ...themeStyles.getOverlayStyle(),
                fontSize: `${CONFIG.spacing.fontSize.medium}px`,
              }}
            >
              {zoomMode === "zoomedOut" ? "Module View" : "Function View"}
            </div>

            {/* Performance info */}
            {nodes.length > CONFIG.performance.nodes.showStats && (
              <div
                style={{
                  padding: "4px 8px",
                  ...themeStyles.getOverlayStyle(),
                  fontSize: `${CONFIG.spacing.fontSize.small}px`,
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
                ...themeStyles.getButtonStyle(showMiniMap ? 'primary' : 'secondary'),
                padding: `${CONFIG.spacing.padding.small}px ${CONFIG.spacing.padding.medium}px`,
                fontSize: `${CONFIG.spacing.fontSize.small}px`,
                borderRadius: `${CONFIG.spacing.borderRadius.small}px`,
                opacity: showMiniMap ? 1 : 0.7,
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
                    notify("Graph state saved!", "info");
                  }
                }}
                style={{
                  ...themeStyles.getButtonStyle('primary'),
                  padding: `${CONFIG.spacing.padding.small}px ${CONFIG.spacing.padding.medium}px`,
                  fontSize: `${CONFIG.spacing.fontSize.small}px`,
                  borderRadius: `${CONFIG.spacing.borderRadius.small}px`,
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
                  ...themeStyles.getButtonStyle('secondary'),
                  padding: `${CONFIG.spacing.padding.small}px ${CONFIG.spacing.padding.medium}px`,
                  fontSize: `${CONFIG.spacing.fontSize.small}px`,
                  borderRadius: `${CONFIG.spacing.borderRadius.small}px`,
                }}
              >
                Export
              </button>
              <button
                onClick={() => {
                  clearGraphState();
                  notify("Saved state cleared!", "info");
                }}
                style={{
                  ...themeStyles.getButtonStyle('danger'),
                  padding: `${CONFIG.spacing.padding.small}px ${CONFIG.spacing.padding.medium}px`,
                  fontSize: `${CONFIG.spacing.fontSize.small}px`,
                  borderRadius: `${CONFIG.spacing.borderRadius.small}px`,
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

// MiniMap node color function factory
function createMiniMapNodeColor(colors: ReturnType<typeof useFlowThemeStyles>['colors']) {
  return (node: CodeChartNode): string => {
    if (node.type === 'module_group') {
      return colors.node.background.module;
    }
    if (node.data?.is_entry_point) {
      return colors.node.background.entryPoint;
    }
    if (node.selected) {
      return colors.node.border.selected;
    }
    return colors.edge.stroke;
  };
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
