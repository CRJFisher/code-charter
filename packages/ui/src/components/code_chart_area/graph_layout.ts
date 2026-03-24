import ELK, { ElkNode } from 'elkjs/lib/elk.bundled.js';
import { CodeChartNode, CodeChartEdge, isCodeNode, isModuleNode } from './chart_types';
import { LayoutCache } from './layout_cache';
import { withRetry, LayoutError, ErrorRecovery, errorLogger } from './error_handling';
import { CONFIG } from './chart_config';

const elk = new ELK();

// Create cache instances
const layoutCache = new LayoutCache();
const dimensionCache = new LayoutCache();

// ELK layout options from configuration
const elkOptions: Record<string, string> = {
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
const MODULE_PADDING = 40;

/**
 * Build a hierarchical ELK graph where module nodes contain their children.
 * Edges are assigned to the lowest common ancestor container.
 */
function build_elk_graph(
  nodes: CodeChartNode[],
  edges: CodeChartEdge[]
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
        ...elkOptions,
        'elk.padding': `[top=${MODULE_PADDING + 30},left=${MODULE_PADDING},bottom=${MODULE_PADDING},right=${MODULE_PADDING}]`,
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

  // Build top-level function ELK nodes
  const elk_top_level: ElkNode[] = top_level_functions.map(fn => ({
    id: fn.id,
    width: fn.width || CONFIG.node.default.width,
    height: fn.height || CONFIG.node.default.height,
  }));

  return {
    id: 'root',
    layoutOptions: elkOptions,
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

export async function applyHierarchicalLayout(
  nodes: CodeChartNode[],
  edges: CodeChartEdge[],
): Promise<CodeChartNode[]> {
  if (nodes.length === 0) {
    return [];
  }

  // Check cache first
  const cacheKey = layoutCache.generateKey(nodes, edges);
  const cached = layoutCache.get(cacheKey);
  if (cached) {
    console.log('[Layout] Using cached layout');
    return cached;
  }

  // Build hierarchical ELK graph
  const elk_graph = build_elk_graph(nodes, edges);

  try {
    const layoutedNodes = await withRetry(
      async () => {
        const layouted = await elk.layout(elk_graph);
        const elk_positions = flatten_elk_nodes(layouted);

        // Apply positions back to React Flow nodes
        return nodes.map(node => {
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
        maxAttempts: CONFIG.layout.retry.maxAttempts,
        delayMs: CONFIG.layout.retry.delayMs,
        onRetry: (attempt, error) => {
          console.warn(`[Layout] Retry attempt ${attempt} after error:`, error.message);
        },
      }
    );

    layoutCache.set(cacheKey, layoutedNodes);
    return layoutedNodes;
  } catch (error) {
    console.error('Error applying ELK layout:', error);
    errorLogger.log(
      new LayoutError('ELK layout failed', nodes.length, edges.length),
      'error',
      { error: error instanceof Error ? error.message : String(error) }
    );

    return ErrorRecovery.tryWithFallback(
      async () => {
        throw error;
      },
      async () => applyFallbackLayout(nodes, edges),
      (err) => {
        console.log('[Layout] Falling back to grid layout due to:', err.message);
      }
    );
  }
}

// Helper function to calculate node dimensions based on content
export function calculateNodeDimensions(node: CodeChartNode): { width: number; height: number } {
  // Check cache first
  const cacheKey = `dimension-${node.id}`;
  const cached = dimensionCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Base dimensions from configuration
  const basePadding = CONFIG.node.text.basePadding;
  const charWidth = CONFIG.node.text.charWidth;
  const lineHeight = CONFIG.node.text.lineHeight;
  
  // Calculate based on content
  let functionNameLength = 0;
  let description_length = 0;
  
  if (isCodeNode(node)) {
    functionNameLength = (node.data.function_name || '').length;
    description_length = (node.data.description || '').length;
  } else if (isModuleNode(node)) {
    functionNameLength = (node.data.module_name || '').length;
    description_length = (node.data.description || '').length;
  }
  
  // Width calculation (with max/min constraints)
  const minWidth = CONFIG.node.constraints.minWidth;
  const maxWidth = CONFIG.node.constraints.maxWidth;
  const calculatedWidth = Math.max(functionNameLength * charWidth, description_length * charWidth / 3) + basePadding * 2;
  const width = Math.min(Math.max(calculatedWidth, minWidth), maxWidth);
  
  // Height calculation based on text wrapping
  const description_lines = Math.ceil((description_length * charWidth) / (width - basePadding * 2));
  const height = basePadding * 2 + lineHeight * 2 + (description_lines * lineHeight);
  
  const dimensions = { width, height };
  dimensionCache.set(cacheKey, dimensions);
  return dimensions;
}

// Clear caches when needed
export function clearLayoutCaches(): void {
  layoutCache.clear();
  dimensionCache.clear();
  console.log('[Performance] Layout caches cleared');
}

// Fallback layout algorithm - simple grid layout
export function applyFallbackLayout(
  nodes: CodeChartNode[],
  edges: CodeChartEdge[]
): Promise<CodeChartNode[]> {
  console.log('[Layout] Using fallback grid layout');
  
  const GRID_SPACING_X = CONFIG.layout.grid.spacingX;
  const GRID_SPACING_Y = CONFIG.layout.grid.spacingY;
  const NODES_PER_ROW = Math.ceil(Math.sqrt(nodes.length));
  
  // Group nodes by their connections
  const nodeGroups = new Map<string, Set<string>>();
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
  const dfs = (nodeId: string, group: Set<string>) => {
    if (processed.has(nodeId)) return;
    processed.add(nodeId);
    group.add(nodeId);
    
    const neighbors = adjacency.get(nodeId) || new Set();
    neighbors.forEach(neighbor => dfs(neighbor, group));
  };
  
  // Find all connected components
  let groupIndex = 0;
  nodes.forEach(node => {
    if (!processed.has(node.id)) {
      const group = new Set<string>();
      dfs(node.id, group);
      nodeGroups.set(`group-${groupIndex++}`, group);
    }
  });
  
  // Layout nodes
  const layoutedNodes = [...nodes];
  const currentX = 0;
  let currentY = 0;
  let rowHeight = 0;
  
  // Layout each group
  nodeGroups.forEach((group) => {
    const groupNodes = layoutedNodes.filter(n => group.has(n.id));
    
    // Layout nodes in this group
    groupNodes.forEach((node, index) => {
      const col = index % NODES_PER_ROW;
      const row = Math.floor(index / NODES_PER_ROW);
      
      node.position = {
        x: currentX + col * GRID_SPACING_X,
        y: currentY + row * GRID_SPACING_Y,
      };
      
      rowHeight = Math.max(rowHeight, (row + 1) * GRID_SPACING_Y);
    });
    
    // Move to next group position
    currentY += rowHeight + GRID_SPACING_Y;
    rowHeight = 0;
  });
  
  return Promise.resolve(layoutedNodes);
}