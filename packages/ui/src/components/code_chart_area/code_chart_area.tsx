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
  type OnSelectionChangeParams,
  MiniMap,
} from "@xyflow/react";
import type { EdgeRow, NodeRow } from "@code-charter/types";
import { CodeChartNode, CodeChartEdge } from "./chart_types";
import "@xyflow/react/dist/style.css";

import { CodeIndexStatus, DescriptionStatus } from "../loading_status";
import { apply_hierarchical_layout } from "./graph_layout";
import { build_node_types } from "./chart_node_types";
import { ProvenancePanel } from "./provenance_panel";
import { generate_react_flow_elements } from "./call_tree_to_graph";
import { compute_parent_resize, apply_parent_resize } from "./parent_resize";
import { LoadingIndicator } from "./loading_indicator";
import { save_graph_state, load_graph_state, export_graph_state, clear_graph_state } from "./state_persistence";
import { use_keyboard_navigation, SkipToGraph } from "./keyboard_navigation";
import { use_debounce } from "../../hooks/use_debounce";
import { use_throttle } from "../../hooks/use_throttle";
import { clear_layout_caches } from "./graph_layout";
import { get_visible_nodes, use_virtual_nodes, ViewportIndicator } from "./virtual_renderer";
import { SearchPanel } from "./search_panel";
import { ErrorBoundary } from "../../error/error_boundary";
import { ErrorNotifications, use_error_notification } from "../../error/error_notifications";
import { handle_react_flow_error, error_logger } from "./error_handling";
import { CONFIG } from "./chart_config";
import { use_flow_theme_styles } from "./use_chart_theme_styles";

type ZoomMode = "zoomedIn" | "zoomedOut";

interface CodeChartAreaProps {
  selected_entry_point: CallableNode | null;
  screen_width_fraction: number;
  get_descriptions: (node_symbol: string) => Promise<DocstringSummaries | undefined>;
  detect_modules: () => Promise<NodeGroup[] | undefined>;
  indexing_status: CodeIndexStatus;
}

// ARIA label configuration for accessibility
const aria_label_config = {
  'node.a11yDescription.default': 'Press Enter to select this node. Use arrow keys to navigate.',
  'node.a11yDescription.keyboardDisabled': 'Keyboard navigation is disabled',
  'edge.a11yDescription.default': 'Connection between functions. Press Enter to focus.',
};

const CodeChartAreaReactFlowInner: React.FC<CodeChartAreaProps> = ({
  selected_entry_point,
  screen_width_fraction,
  get_descriptions,
  detect_modules,
  indexing_status,
}) => {
  const [nodes, set_nodes, on_nodes_change] = useNodesState<CodeChartNode>([]);
  const [edges, set_edges, on_edges_change] = useEdgesState<CodeChartEdge>([]);
  const [zoom_mode, set_zoom_mode] = useState<ZoomMode>("zoomedOut");
  const [, set_call_chart] = useState<Record<string, CallableNode> | null>(null);
  const [description_status, set_description_status] = useState<DescriptionStatus>(DescriptionStatus.LoadingDescriptions);
  const [error, set_error] = useState<string | null>(null);
  const [show_mini_map, set_show_mini_map] = useState(true);
  const container_ref = useRef<HTMLDivElement>(null);
  const node_groups_ref = useRef<NodeGroup[] | undefined>(undefined);
  const react_flow_instance = useRef<ReactFlowInstance<CodeChartNode, CodeChartEdge> | null>(null);
  const { notify } = use_error_notification();
  const theme_styles = use_flow_theme_styles();
  const mini_map_node_color = useMemo(() => create_mini_map_node_color(theme_styles.colors), [theme_styles.colors]);

  // The React Flow node-type map, derived once from the open kind registry (AC#6).
  const node_types = useMemo(() => build_node_types(), []);

  // Selection-driven provenance (AC#8): the panel reads the selected node's/edge's source row.
  const [selection, set_selection] = useState<{ node?: NodeRow; edge?: EdgeRow }>({});
  const on_selection_change = useCallback((params: OnSelectionChangeParams<CodeChartNode, CodeChartEdge>) => {
    set_selection({ node: params.nodes[0]?.data.row, edge: params.edges[0]?.data?.row });
  }, []);

  // Use keyboard navigation hook
  const on_node_navigate = useCallback((node_id: string) => {
    if (react_flow_instance.current) {
      const node = react_flow_instance.current.getNode(node_id);
      if (node) {
        react_flow_instance.current.setCenter(node.position.x, node.position.y, {
          duration: CONFIG.animation.duration.panToNode,
          zoom: react_flow_instance.current.getZoom(),
        });
      }
    }
  }, []);
  const keyboard_nav_props = useMemo(() => ({ on_node_navigate: on_node_navigate }), [on_node_navigate]);
  use_keyboard_navigation(keyboard_nav_props);

  // Monitor zoom level and viewport
  const viewport_x = useStore((state: XYFlowState) => state.transform[0]);
  const viewport_y = useStore((state: XYFlowState) => state.transform[1]);
  const viewport_zoom = useStore((state: XYFlowState) => state.transform[2]);
  const viewport = useMemo(() => ({ x: viewport_x, y: viewport_y, zoom: viewport_zoom }), [viewport_x, viewport_y, viewport_zoom]);
  const ZOOM_THRESHOLD = CONFIG.zoom.levels.threshold;

  // Debounce viewport changes for performance
  const debounced_viewport = use_debounce(viewport, CONFIG.animation.debounce.viewport);

  // Update zoom mode based on zoom level
  useEffect(() => {
    const new_zoom_mode = viewport_zoom < ZOOM_THRESHOLD ? "zoomedOut" : "zoomedIn";
    if (new_zoom_mode !== zoom_mode) {
      set_zoom_mode(new_zoom_mode);
    }
  }, [viewport_zoom, zoom_mode]);

  // Memoize visible nodes for virtualization
  const visible_node_ids = useMemo(() => {
    if (!container_ref.current || nodes.length === 0) {
      return new Set<string>();
    }

    return get_visible_nodes(
      nodes,
      debounced_viewport,
      container_ref.current.clientWidth,
      container_ref.current.clientHeight
    );
  }, [nodes, debounced_viewport]);

  // Apply virtual rendering for large graphs
  const { virtual_nodes, virtual_edges, hidden_node_count } = use_virtual_nodes({
    nodes,
    edges,
    visible_node_ids: nodes.length > CONFIG.performance.nodes.largeGraph ? visible_node_ids : new Set(),
    render_buffer: CONFIG.performance.virtualRender.render_buffer,
  });

  // Clear caches when entry point changes
  useEffect(() => {
    if (selected_entry_point) {
      clear_layout_caches();
    }
  }, [selected_entry_point?.symbol_id]);

  useEffect(() => {
    if (!selected_entry_point) {
      return;
    }

    let cancelled = false;

    const fetch_data = async () => {
      try {
        set_error(null);
        set_description_status(DescriptionStatus.LoadingDescriptions);

        // Clear any graph data from the previous entrypoint before loading
        // the new one. Without this, stale nodes/edges remain in ReactFlow's
        // internal store during the async window, and module IDs (now
        // namespaced per-entrypoint) from the previous render can leak
        // through the virtual-renderer's empty-viewport fallback.
        set_nodes([]);
        set_edges([]);

        // Check for saved state first
        const saved_state = load_graph_state(selected_entry_point.symbol_id);
        if (saved_state) {
          if (cancelled) return;
          set_nodes(saved_state.nodes);
          set_edges(saved_state.edges);
          set_description_status(DescriptionStatus.Ready);
          return;
        }

        const docstring_summaries = await get_descriptions(selected_entry_point.symbol_id);
        if (cancelled) return;
        if (!docstring_summaries) {
          throw new Error("Failed to load code tree descriptions");
        }
        set_call_chart(docstring_summaries.call_tree);

        set_description_status(DescriptionStatus.DetectingModules);
        const node_groups = await detect_modules();
        if (cancelled) return;
        node_groups_ref.current = node_groups;

        // Generate all nodes and edges from the call tree. Leaf rendering migrates to
        // `custom_graph_to_react_flow` (which reads `render(layers)` rows and carries `data.row` for
        // the provenance panel) once the backend feeds this component those rows — task-27.1.3.
        const { nodes: flow_nodes, edges: flow_edges } = generate_react_flow_elements(
          selected_entry_point,
          docstring_summaries,
          node_groups,
          theme_styles.colors.cluster?.palette
        );

        // Apply hierarchical layout
        const layouted_nodes = await apply_hierarchical_layout(flow_nodes, flow_edges);
        if (cancelled) return;

        set_nodes(layouted_nodes);
        set_edges(flow_edges);
        set_description_status(DescriptionStatus.Ready);
      } catch (err) {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error("An error occurred");
        set_error(error.message);
        set_description_status(DescriptionStatus.Error);
        error_logger.log(error, 'error', { entry_point: selected_entry_point.symbol_id });
        handle_react_flow_error(error);

        // Show notification with retry option
        notify(
          'Failed to load visualization data',
          'error',
          [
            { label: 'Retry', action: () => fetch_data() },
            { label: 'Dismiss', action: () => undefined },
          ]
        );
      }
    };

    fetch_data();

    return () => {
      cancelled = true;
    };
    // Depend only on the entry point id. Including the function props would
    // cancel-and-restart on every App render (their closures are recreated
    // each render), creating an infinite loop with the .finally state updates
    // in App.fetch_descriptions.
  }, [selected_entry_point?.symbol_id]);

  const get_visibility_class_names = (show: boolean): string => {
    return show ? "visible" : "invisible";
  };

  // Throttle save operations for performance (manual Save button)
  const handle_save_state = use_throttle(useCallback((instance: ReactFlowInstance<CodeChartNode, CodeChartEdge>) => {
    if (!selected_entry_point || !instance) return;

    const viewport = instance.getViewport();
    save_graph_state(instance.getNodes(), instance.getEdges(), viewport, selected_entry_point.symbol_id);
  }, [selected_entry_point]), CONFIG.animation.debounce.save);

  // Debounced autosave driven by local state. Reading `nodes`/`edges` directly
  // (rather than `instance.getNodes()`) avoids a race with React Flow's
  // internal store: after `set_nodes(...)` from a drag-stop resize, the local
  // state is already the source of truth.
  const debounced_nodes = use_debounce(nodes, CONFIG.animation.debounce.save);
  const debounced_edges = use_debounce(edges, CONFIG.animation.debounce.save);
  useEffect(() => {
    if (description_status !== DescriptionStatus.Ready) return;
    if (!selected_entry_point || !react_flow_instance.current) return;
    const viewport = react_flow_instance.current.getViewport();
    save_graph_state(debounced_nodes, debounced_edges, viewport, selected_entry_point.symbol_id);
  }, [debounced_nodes, debounced_edges, description_status, selected_entry_point?.symbol_id]);

  // Export state to file
  const handle_export_state = useCallback((instance: ReactFlowInstance<CodeChartNode, CodeChartEdge>) => {
    if (!selected_entry_point || !instance) return;

    const viewport = instance.getViewport();
    export_graph_state(instance.getNodes(), instance.getEdges(), viewport, selected_entry_point.symbol_id);
  }, [selected_entry_point]);

  // Handle React Flow initialization
  const on_init = useCallback((instance: ReactFlowInstance<CodeChartNode, CodeChartEdge>) => {
    if (!selected_entry_point) return;

    react_flow_instance.current = instance;

    // Check for saved viewport
    const saved_state = load_graph_state(selected_entry_point.symbol_id);
    if (saved_state?.viewport) {
      instance.setViewport(saved_state.viewport);
    }
  }, [selected_entry_point]);

  if (indexing_status !== CodeIndexStatus.Ready) {
    return (
      <div
        className="chart-container"
        style={{
          width: `${screen_width_fraction * 100}%`,
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

  const show_elements = selected_entry_point !== null && description_status === DescriptionStatus.Ready;

  return (
    <>
      <SkipToGraph />
      <div
        ref={container_ref}
        className="chart-container"
        style={{
          width: `${screen_width_fraction * 100}%`,
          height: "100vh",
          position: "relative",
        }}
        id="code-flow-graph"
      >
      <div
        className={`loading-container ${get_visibility_class_names(description_status !== DescriptionStatus.Ready)}`}
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
            ...theme_styles.get_error_style(),
            borderRadius: "4px",
            maxWidth: "400px",
          }}>
            <div style={{ fontWeight: "bold", marginBottom: "8px" }}>Error</div>
            <div>{error}</div>
          </div>
        )}
      </div>

      <div className={get_visibility_class_names(show_elements)} style={{ width: "100%", height: "100%" }}>
        <ReactFlow
          nodes={virtual_nodes}
          edges={virtual_edges}
          onNodesChange={on_nodes_change}
          onEdgesChange={on_edges_change}
          onSelectionChange={on_selection_change}
          nodeTypes={node_types}
          fitView
          fitViewOptions={{
            padding: CONFIG.viewport.fit_view.padding,
            duration: CONFIG.animation.duration.fit_view,
          }}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
          nodesFocusable={true}
          edgesFocusable={true}
          autoPanOnNodeFocus={true}
          ariaLabelConfig={aria_label_config}
          minZoom={CONFIG.zoom.levels.min}
          maxZoom={CONFIG.zoom.levels.max}
          defaultEdgeOptions={{
            style: theme_styles.get_edge_style(false),
            ariaLabel: 'Function call',
          }}
          onInit={on_init}
          onNodeDragStop={(_evt, node) => {
            // Shrink-fit the parent module to its children's bounding box.
            // Children's positions are relative to the parent, so after a drag
            // there may be slack on the right/bottom that expandParent didn't
            // remove. Autosave runs separately in the nodes-effect below, so
            // the saved snapshot reflects the post-resize state.
            if (node.type !== "code_function") return;
            const parent_id = node.parentId;
            if (!parent_id) return;
            set_nodes(current => {
              const resize = compute_parent_resize(parent_id, current);
              return resize ? apply_parent_resize(current, resize) : current;
            });
          }}
          aria-label="Code flow diagram showing function calls and dependencies"
          role="application"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={CONFIG.background.gap}
            size={CONFIG.background.size}
            color={theme_styles.colors.background.dots}
          />
          <Controls />

          {/* Mini Map */}
          {show_mini_map && (
            <MiniMap
              nodeColor={mini_map_node_color}
              nodeStrokeWidth={CONFIG.minimap.nodeStrokeWidth}
              pannable
              zoomable
              style={{
                backgroundColor: theme_styles.colors.ui.background.minimap,
                border: `1px solid ${theme_styles.colors.ui.border}`,
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
                ...theme_styles.get_overlay_style(),
                fontSize: `${CONFIG.spacing.fontSize.medium}px`,
              }}
            >
              {zoom_mode === "zoomedOut" ? "Module View" : "Function View"}
            </div>

            {/* Performance info */}
            {nodes.length > CONFIG.performance.nodes.showStats && (
              <div
                style={{
                  padding: "4px 8px",
                  ...theme_styles.get_overlay_style(),
                  fontSize: `${CONFIG.spacing.fontSize.small}px`,
                  marginBottom: `${CONFIG.spacing.margin.small}px`,
                }}
              >
                {nodes.length} nodes • {virtual_nodes.length} rendered • {hidden_node_count} hidden
              </div>
            )}

            {/* Show indicators for hidden nodes */}
            {hidden_node_count > CONFIG.performance.nodes.hideIndicator && (
              <ViewportIndicator
                direction="top"
                count={Math.floor(hidden_node_count / 4)}
                on_click={() => {
                  if (react_flow_instance.current) {
                    react_flow_instance.current.fitView({ padding: CONFIG.viewport.fit_view.padding });
                  }
                }}
              />
            )}

            {/* MiniMap Toggle */}
            <button
              onClick={() => set_show_mini_map(!show_mini_map)}
              style={{
                ...theme_styles.get_button_style(show_mini_map ? 'primary' : 'secondary'),
                padding: `${CONFIG.spacing.padding.small}px ${CONFIG.spacing.padding.medium}px`,
                fontSize: `${CONFIG.spacing.fontSize.small}px`,
                borderRadius: `${CONFIG.spacing.borderRadius.small}px`,
                opacity: show_mini_map ? 1 : 0.7,
                marginBottom: `${CONFIG.spacing.margin.small}px`,
              }}
              aria-label={show_mini_map ? "Hide mini-map" : "Show mini-map"}
            >
              {show_mini_map ? "🗺️ Hide Map" : "🗺️ Show Map"}
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
                  if (react_flow_instance.current) {
                    handle_save_state(react_flow_instance.current);
                    notify("Graph state saved!", "info");
                  }
                }}
                style={{
                  ...theme_styles.get_button_style('primary'),
                  padding: `${CONFIG.spacing.padding.small}px ${CONFIG.spacing.padding.medium}px`,
                  fontSize: `${CONFIG.spacing.fontSize.small}px`,
                  borderRadius: `${CONFIG.spacing.borderRadius.small}px`,
                }}
              >
                Save
              </button>
              <button
                onClick={() => {
                  if (react_flow_instance.current) {
                    handle_export_state(react_flow_instance.current);
                  }
                }}
                style={{
                  ...theme_styles.get_button_style('secondary'),
                  padding: `${CONFIG.spacing.padding.small}px ${CONFIG.spacing.padding.medium}px`,
                  fontSize: `${CONFIG.spacing.fontSize.small}px`,
                  borderRadius: `${CONFIG.spacing.borderRadius.small}px`,
                }}
              >
                Export
              </button>
              <button
                onClick={() => {
                  clear_graph_state();
                  notify("Saved state cleared!", "info");
                }}
                style={{
                  ...theme_styles.get_button_style('danger'),
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
        <ProvenancePanel node={selection.node} edge={selection.edge} />
      </div>
    </div>
    </>
  );
};

// MiniMap node color function factory
function create_mini_map_node_color(colors: ReturnType<typeof use_flow_theme_styles>['colors']) {
  return (node: CodeChartNode): string => {
    if (node.type === 'module_group') {
      return colors.node.background.module;
    }
    if (node.data?.is_entry_point) {
      return colors.node.background.entry_point;
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
      on_error={(error, error_info) => {
        error_logger.log(error, 'critical', { error_info });
        handle_react_flow_error(error);
      }}
      max_retries={CONFIG.error.retry.max_retries}
    >
      <ReactFlowProvider>
        <CodeChartAreaReactFlowInner {...props} />
        <ErrorNotifications position="bottom" max_notifications={CONFIG.error.notifications.max_notifications} />
      </ReactFlowProvider>
    </ErrorBoundary>
  );
};
