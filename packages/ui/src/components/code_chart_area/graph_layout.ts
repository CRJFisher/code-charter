import ELK, { ElkNode } from 'elkjs/lib/elk.bundled.js';
import { CodeChartNode, CodeChartEdge, is_code_node, is_module_node } from './chart_types';
import { LayoutCache } from './layout_cache';
import { with_retry, LayoutError, ErrorRecovery, error_logger } from './error_handling';
import { CONFIG } from './chart_config';

const elk = new ELK();

// Create cache instances
const layout_cache = new LayoutCache<CodeChartNode[]>();
const dimension_cache = new LayoutCache<{ width: number; height: number }>();

// ELK layout options from configuration
const elk_options: Record<string, string> = {
  'elk.algorithm': CONFIG.layout.elk.algorithm,
  'elk.direction': CONFIG.layout.elk.direction,
  'elk.spacing.nodeNode': String(CONFIG.layout.elk.spacing.nodeNode),
  'elk.layered.spacing.nodeNodeBetweenLayers': String(CONFIG.layout.elk.spacing.nodeNodeBetweenLayers),
  'elk.edgeRouting': CONFIG.layout.elk.edgeRouting,
  'elk.layered.unnecessaryBendpoints': CONFIG.layout.elk.unnecessaryBendpoints,
  'elk.layered.spacing.edgeNodeBetweenLayers': String(CONFIG.layout.elk.spacing.edgeNodeBetweenLayers),
  'elk.layered.nodePlacement.strategy': CONFIG.layout.elk.nodePlacement.strategy,
};

// Module group internal padding for ELK compound nodes
const MODULE_PADDING = CONFIG.layout.module.innerPadding;
const MODULE_HEADER_HEIGHT = CONFIG.layout.module.headerHeight;

/**
 * Build a hierarchical ELK graph where module nodes contain their children.
 * Edges are assigned to the lowest common ancestor container.
 */
/**
 * The per-node ELK layoutOptions that pin a node to its incoming position (AC#7). Emitted only for
 * fixed ids; the JS post-pass also skips overwriting their positions, so a fixed node holds its place
 * regardless of whether the ELK backend honours the hint.
 */
function fixed_position_options(node: CodeChartNode): Record<string, string> {
  return { 'elk.position': `(${node.position?.x ?? 0},${node.position?.y ?? 0})` };
}

function build_elk_graph(
  nodes: CodeChartNode[],
  edges: CodeChartEdge[],
  fixed_ids: Set<string>
): ElkNode {
  // Separate module groups from function nodes
  const module_nodes = nodes.filter(n => n.type === 'module_group');
  const function_nodes = nodes.filter(n => n.type !== 'module_group');

  // Build a set of module IDs for quick lookup
  const module_ids = new Set(module_nodes.map(n => n.id));

  // Group function nodes by parentId
  const children_by_parent = new Map<string, CodeChartNode[]>();
  const top_level_functions: CodeChartNode[] = [];

  for (const fn of function_nodes) {
    if (fn.parentId && module_ids.has(fn.parentId)) {
      if (!children_by_parent.has(fn.parentId)) {
        children_by_parent.set(fn.parentId, []);
      }
      children_by_parent.get(fn.parentId)?.push(fn);
    } else {
      top_level_functions.push(fn);
    }
  }

  // Build set of node IDs in each module for edge routing
  const node_to_module = new Map<string, string>();
  for (const fn of function_nodes) {
    if (fn.parentId && module_ids.has(fn.parentId)) {
      node_to_module.set(fn.id, fn.parentId);
    }
  }

  // Classify edges: internal to a module, cross-module, or top-level
  const module_internal_edges = new Map<string, typeof edges>();
  const root_edges: typeof edges = [];

  for (const edge of edges) {
    // Skip module-to-module edges (they connect compound nodes directly)
    if (module_ids.has(edge.source) || module_ids.has(edge.target)) {
      root_edges.push(edge);
      continue;
    }

    const source_module = node_to_module.get(edge.source);
    const target_module = node_to_module.get(edge.target);

    if (source_module && target_module && source_module === target_module) {
      // Both endpoints in the same module → internal edge
      if (!module_internal_edges.has(source_module)) {
        module_internal_edges.set(source_module, []);
      }
      module_internal_edges.get(source_module)?.push(edge);
    } else {
      // Cross-module or involves top-level node → root edge
      root_edges.push(edge);
    }
  }

  // Build ELK compound nodes for modules
  const elk_module_children: ElkNode[] = module_nodes.map(mod => {
    const children = children_by_parent.get(mod.id) || [];
    const internal_edges = module_internal_edges.get(mod.id) || [];

    return {
      id: mod.id,
      layoutOptions: {
        ...elk_options,
        'elk.padding': `[top=${MODULE_PADDING + MODULE_HEADER_HEIGHT},left=${MODULE_PADDING},bottom=${MODULE_PADDING},right=${MODULE_PADDING}]`,
      },
      children: children.map(child => ({
        id: child.id,
        width: child.width || CONFIG.node.default.width,
        height: child.height || CONFIG.node.default.height,
        ...(fixed_ids.has(child.id)
          ? { x: child.position?.x ?? 0, y: child.position?.y ?? 0, layoutOptions: fixed_position_options(child) }
          : {}),
      })),
      edges: internal_edges.map(e => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
      })),
    };
  });

  // Build top-level function ELK nodes
  const elk_top_level: ElkNode[] = top_level_functions.map(fn => ({
    id: fn.id,
    width: fn.width || CONFIG.node.default.width,
    height: fn.height || CONFIG.node.default.height,
    ...(fixed_ids.has(fn.id)
      ? { x: fn.position?.x ?? 0, y: fn.position?.y ?? 0, layoutOptions: fixed_position_options(fn) }
      : {}),
  }));

  return {
    id: 'root',
    layoutOptions: elk_options,
    children: [...elk_module_children, ...elk_top_level],
    edges: root_edges.map(e => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };
}

/**
 * Recursively collect all ELK nodes into a flat id→ElkNode map.
 */
function flatten_elk_nodes(elk_node: ElkNode, result: Map<string, ElkNode> = new Map()): Map<string, ElkNode> {
  if (elk_node.id !== 'root') {
    result.set(elk_node.id, elk_node);
  }
  for (const child of elk_node.children || []) {
    flatten_elk_nodes(child, result);
  }
  return result;
}

/**
 * Lay the nodes out hierarchically with ELK. `fixed_ids` pins the given nodes to their incoming
 * positions: ELK receives a fixed-position hint for them (AC#7) and the post-pass skips overwriting
 * their positions, so the surrounding graph flows around the pins. An empty set (the default, which
 * this slice's caller passes) is byte-identical to an unpinned layout — same cache key, same output.
 */
export async function apply_hierarchical_layout(
  nodes: CodeChartNode[],
  edges: CodeChartEdge[],
  fixed_ids: Set<string> = new Set(),
): Promise<CodeChartNode[]> {
  if (nodes.length === 0) {
    return [];
  }

  // Check cache first. With no pins the key is unchanged; pins fold into the key so a pinned layout
  // never returns an unpinned cached result.
  const base_key = layout_cache.generate_key(nodes, edges);
  const cache_key = fixed_ids.size === 0 ? base_key : `${base_key}__fixed:${[...fixed_ids].sort().join(',')}`;
  const cached = layout_cache.get(cache_key);
  if (cached) {
    console.log('[Layout] Using cached layout');
    return cached;
  }

  // Build hierarchical ELK graph
  const elk_graph = build_elk_graph(nodes, edges, fixed_ids);

  try {
    const layouted_nodes = await with_retry(
      async () => {
        const layouted = await elk.layout(elk_graph);
        const elk_positions = flatten_elk_nodes(layouted);

        // Apply positions back to React Flow nodes
        return nodes.map(node => {
          // A pinned node keeps its incoming position and style verbatim (AC#7).
          if (fixed_ids.has(node.id)) {
            return node;
          }

          const elk_node = elk_positions.get(node.id);
          if (!elk_node) {
            return node;
          }

          if (node.type === 'module_group') {
            // Module groups get absolute position and ELK-computed dimensions
            return {
              ...node,
              position: {
                x: elk_node.x || 0,
                y: elk_node.y || 0,
              },
              style: {
                ...node.style,
                width: elk_node.width,
                height: elk_node.height,
              },
            };
          }

          // Function nodes: position is relative to parent (if parentId exists,
          // ELK already computed it relative to the compound node)
          return {
            ...node,
            position: {
              x: elk_node.x || 0,
              y: elk_node.y || 0,
            },
          };
        });
      },
      {
        max_attempts: CONFIG.layout.retry.max_attempts,
        delay_ms: CONFIG.layout.retry.delay_ms,
        on_retry: (attempt, error) => {
          console.warn(`[Layout] Retry attempt ${attempt} after error:`, error.message);
        },
      }
    );

    layout_cache.set(cache_key, layouted_nodes);
    return layouted_nodes;
  } catch (error) {
    console.error('Error applying ELK layout:', error);
    error_logger.log(
      new LayoutError('ELK layout failed', nodes.length, edges.length),
      'error',
      { error: error instanceof Error ? error.message : String(error) }
    );

    return ErrorRecovery.try_with_fallback(
      async () => {
        throw error;
      },
      async () => apply_fallback_layout(nodes, edges, fixed_ids),
      (err) => {
        console.log('[Layout] Falling back to grid layout due to:', err.message);
      }
    );
  }
}

// Helper function to calculate node dimensions based on content
export function calculate_node_dimensions(node: CodeChartNode): { width: number; height: number } {
  // Check cache first
  const cache_key = `dimension-${node.id}`;
  const cached = dimension_cache.get(cache_key);
  if (cached) {
    return cached;
  }

  // Base dimensions from configuration
  const base_padding = CONFIG.node.text.base_padding;
  const char_width = CONFIG.node.text.char_width;
  const line_height = CONFIG.node.text.line_height;
  
  // Calculate based on content
  let function_name_length = 0;
  let description_length = 0;
  
  if (is_code_node(node)) {
    function_name_length = (node.data.function_name || '').length;
    description_length = (node.data.description || '').length;
  } else if (is_module_node(node)) {
    function_name_length = (node.data.module_name || '').length;
    description_length = (node.data.description || '').length;
  }
  
  // Width calculation (with max/min constraints)
  const min_width = CONFIG.node.constraints.min_width;
  const max_width = CONFIG.node.constraints.max_width;
  const calculated_width = Math.max(function_name_length * char_width, description_length * char_width / 3) + base_padding * 2;
  const width = Math.min(Math.max(calculated_width, min_width), max_width);
  
  // Height calculation based on text wrapping
  const description_lines = Math.ceil((description_length * char_width) / (width - base_padding * 2));
  const height = base_padding * 2 + line_height * 2 + (description_lines * line_height);
  
  const dimensions = { width, height };
  dimension_cache.set(cache_key, dimensions);
  return dimensions;
}

// Clear caches when needed
export function clear_layout_caches(): void {
  layout_cache.clear();
  dimension_cache.clear();
  console.log('[Performance] Layout caches cleared');
}

// Fallback layout algorithm - simple grid layout. Pinned nodes (AC#7) keep their incoming position.
export function apply_fallback_layout(
  nodes: CodeChartNode[],
  edges: CodeChartEdge[],
  fixed_ids: Set<string> = new Set()
): Promise<CodeChartNode[]> {
  console.log('[Layout] Using fallback grid layout');
  
  const GRID_SPACING_X = CONFIG.layout.grid.spacingX;
  const GRID_SPACING_Y = CONFIG.layout.grid.spacingY;
  const NODES_PER_ROW = Math.ceil(Math.sqrt(nodes.length));
  
  // Group nodes by their connections
  const node_groups = new Map<string, Set<string>>();
  const processed = new Set<string>();
  
  // Build adjacency map
  const adjacency = new Map<string, Set<string>>();
  edges.forEach(edge => {
    if (!adjacency.has(edge.source)) {
      adjacency.set(edge.source, new Set());
    }
    if (!adjacency.has(edge.target)) {
      adjacency.set(edge.target, new Set());
    }
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  });
  
  // DFS to find connected components
  const dfs = (node_id: string, group: Set<string>) => {
    if (processed.has(node_id)) return;
    processed.add(node_id);
    group.add(node_id);
    
    const neighbors = adjacency.get(node_id) || new Set();
    neighbors.forEach(neighbor => dfs(neighbor, group));
  };
  
  // Find all connected components
  let group_index = 0;
  nodes.forEach(node => {
    if (!processed.has(node.id)) {
      const group = new Set<string>();
      dfs(node.id, group);
      node_groups.set(`group-${group_index++}`, group);
    }
  });
  
  // Layout nodes
  const layouted_nodes = [...nodes];
  const current_x = 0;
  let current_y = 0;
  let row_height = 0;
  
  // Layout each group
  node_groups.forEach((group) => {
    const group_nodes = layouted_nodes.filter(n => group.has(n.id));
    
    // Layout nodes in this group
    group_nodes.forEach((node, index) => {
      if (fixed_ids.has(node.id)) {
        return; // pinned: keep the incoming position
      }
      const col = index % NODES_PER_ROW;
      const row = Math.floor(index / NODES_PER_ROW);

      node.position = {
        x: current_x + col * GRID_SPACING_X,
        y: current_y + row * GRID_SPACING_Y,
      };

      row_height = Math.max(row_height, (row + 1) * GRID_SPACING_Y);
    });
    
    // Move to next group position
    current_y += row_height + GRID_SPACING_Y;
    row_height = 0;
  });
  
  return Promise.resolve(layouted_nodes);
}