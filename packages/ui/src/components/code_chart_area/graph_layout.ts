import ELK, { ElkNode } from 'elkjs/lib/elk.bundled.js';
import { CodeChartNode, CodeChartEdge } from './chart_types';
import { LayoutCache } from './layout_cache';
import { with_retry, LayoutError, ErrorRecovery, error_logger } from './error_handling';
import { CONFIG } from './chart_config';

const elk = new ELK();

const layout_cache = new LayoutCache<CodeChartNode[]>();

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

const MODULE_PADDING = CONFIG.layout.module.innerPadding;
const MODULE_HEADER_HEIGHT = CONFIG.layout.module.headerHeight;

/**
 * Build a hierarchical ELK graph where module nodes contain their children. Edges are assigned to
 * the lowest common ancestor container so ELK routes intra-module edges inside the compound node.
 */
function build_elk_graph(
  nodes: CodeChartNode[],
  edges: CodeChartEdge[]
): ElkNode {
  const module_nodes = nodes.filter(n => n.type === 'module_group');
  const function_nodes = nodes.filter(n => n.type !== 'module_group');
  const module_ids = new Set(module_nodes.map(n => n.id));

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

  const node_to_module = new Map<string, string>();
  for (const fn of function_nodes) {
    if (fn.parentId && module_ids.has(fn.parentId)) {
      node_to_module.set(fn.id, fn.parentId);
    }
  }

  const module_internal_edges = new Map<string, typeof edges>();
  const root_edges: typeof edges = [];

  for (const edge of edges) {
    // Module endpoints connect compound nodes directly, so route them at the root.
    if (module_ids.has(edge.source) || module_ids.has(edge.target)) {
      root_edges.push(edge);
      continue;
    }

    const source_module = node_to_module.get(edge.source);
    const target_module = node_to_module.get(edge.target);

    if (source_module && target_module && source_module === target_module) {
      if (!module_internal_edges.has(source_module)) {
        module_internal_edges.set(source_module, []);
      }
      module_internal_edges.get(source_module)?.push(edge);
    } else {
      root_edges.push(edge);
    }
  }

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
      })),
      edges: internal_edges.map(e => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
      })),
    };
  });

  const elk_top_level: ElkNode[] = top_level_functions.map(fn => ({
    id: fn.id,
    width: fn.width || CONFIG.node.default.width,
    height: fn.height || CONFIG.node.default.height,
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

function flatten_elk_nodes(elk_node: ElkNode, result: Map<string, ElkNode> = new Map()): Map<string, ElkNode> {
  if (elk_node.id !== 'root') {
    result.set(elk_node.id, elk_node);
  }
  for (const child of elk_node.children || []) {
    flatten_elk_nodes(child, result);
  }
  return result;
}

export async function apply_hierarchical_layout(
  nodes: CodeChartNode[],
  edges: CodeChartEdge[],
): Promise<CodeChartNode[]> {
  if (nodes.length === 0) {
    return [];
  }

  const cache_key = layout_cache.generate_key(nodes, edges);
  const cached = layout_cache.get(cache_key);
  if (cached) {
    console.log('[Layout] Using cached layout');
    return cached;
  }

  const elk_graph = build_elk_graph(nodes, edges);

  try {
    const layouted_nodes = await with_retry(
      async () => {
        const layouted = await elk.layout(elk_graph);
        const elk_positions = flatten_elk_nodes(layouted);

        return nodes.map(node => {
          const elk_node = elk_positions.get(node.id);
          if (!elk_node) {
            return node;
          }

          if (node.type === 'module_group') {
            // Module groups carry an absolute position plus the ELK-computed compound size.
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

          // For a child of a compound node ELK reports a position relative to its parent, which is
          // exactly what React Flow expects, so it is applied verbatim.
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
      async () => apply_fallback_layout(nodes, edges),
      (err) => {
        console.log('[Layout] Falling back to grid layout due to:', err.message);
      }
    );
  }
}

export function clear_layout_caches(): void {
  layout_cache.clear();
  console.log('[Performance] Layout caches cleared');
}

/**
 * Grid layout used when ELK fails, so the graph still renders something usable.
 */
function apply_fallback_layout(
  nodes: CodeChartNode[],
  edges: CodeChartEdge[]
): Promise<CodeChartNode[]> {
  console.log('[Layout] Using fallback grid layout');
  
  const GRID_SPACING_X = CONFIG.layout.grid.spacingX;
  const GRID_SPACING_Y = CONFIG.layout.grid.spacingY;
  const NODES_PER_ROW = Math.ceil(Math.sqrt(nodes.length));

  const node_groups = new Map<string, Set<string>>();
  const processed = new Set<string>();

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
  
  const dfs = (node_id: string, group: Set<string>) => {
    if (processed.has(node_id)) return;
    processed.add(node_id);
    group.add(node_id);

    const neighbors = adjacency.get(node_id) || new Set();
    neighbors.forEach(neighbor => dfs(neighbor, group));
  };

  let group_index = 0;
  nodes.forEach(node => {
    if (!processed.has(node.id)) {
      const group = new Set<string>();
      dfs(node.id, group);
      node_groups.set(`group-${group_index++}`, group);
    }
  });

  // Each connected component is laid out as its own grid, stacked vertically down the canvas.
  const layouted_nodes = [...nodes];
  const current_x = 0;
  let current_y = 0;
  let row_height = 0;

  node_groups.forEach((group) => {
    const group_nodes = layouted_nodes.filter(n => group.has(n.id));

    group_nodes.forEach((node, index) => {
      const col = index % NODES_PER_ROW;
      const row = Math.floor(index / NODES_PER_ROW);

      node.position = {
        x: current_x + col * GRID_SPACING_X,
        y: current_y + row * GRID_SPACING_Y,
      };

      row_height = Math.max(row_height, (row + 1) * GRID_SPACING_Y);
    });

    current_y += row_height + GRID_SPACING_Y;
    row_height = 0;
  });
  
  return Promise.resolve(layouted_nodes);
}