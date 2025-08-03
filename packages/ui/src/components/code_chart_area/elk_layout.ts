import ELK from 'elkjs/lib/elk.bundled.js';
import { Node, Edge } from '@xyflow/react';
import { CodeChartNode, CodeChartEdge, isCodeNode, isModuleNode } from './react_flow_types';
import { CodeNodeData } from './code_function_node';
import { ModuleNodeData } from './zoom_aware_node';
import { LayoutCache, PerformanceMonitor } from './performance_utils';
import { withRetry, LayoutError, ErrorRecovery, errorLogger } from './error_handling';
import { LAYOUT_CONFIG, NODE_CONFIG } from './config';

const elk = new ELK();

// Create cache instances
const layoutCache = new LayoutCache();
const dimensionCache = new LayoutCache();
const perfMonitor = new PerformanceMonitor();

// ELK layout options from configuration
const elkOptions = {
  'elk.algorithm': LAYOUT_CONFIG.elk.algorithm,
  'elk.direction': LAYOUT_CONFIG.elk.direction,
  'elk.spacing.nodeNode': String(LAYOUT_CONFIG.elk.spacing.nodeNode),
  'elk.layered.spacing.nodeNodeBetweenLayers': String(LAYOUT_CONFIG.elk.spacing.nodeNodeBetweenLayers),
  'elk.edgeRouting': LAYOUT_CONFIG.elk.edgeRouting,
  'elk.layered.unnecessaryBendpoints': LAYOUT_CONFIG.elk.unnecessaryBendpoints,
  'elk.layered.spacing.edgeNodeBetweenLayers': String(LAYOUT_CONFIG.elk.spacing.edgeNodeBetweenLayers),
  'elk.layered.nodePlacement.strategy': LAYOUT_CONFIG.elk.nodePlacement.strategy,
};

export interface LayoutOptions {
  animate?: boolean;
  animationDuration?: number;
  constraints?: LayoutConstraint[];
}

export interface LayoutConstraint {
  type: 'topBottom' | 'leftRight';
  from: string;
  to: string;
}

export async function applyHierarchicalLayout(
  nodes: CodeChartNode[],
  edges: CodeChartEdge[],
  options: LayoutOptions = {}
): Promise<CodeChartNode[]> {
  // If no nodes, return empty array
  if (nodes.length === 0) {
    return [];
  }

  // Check cache first
  const cacheKey = `layout-${nodes.length}-${edges.length}`;
  const cached = layoutCache.get(cacheKey);
  if (cached) {
    console.log('[Layout] Using cached layout');
    return cached;
  }

  perfMonitor.startMeasure('elk-layout');

  // Convert React Flow nodes to ELK nodes
  const elkNodes = nodes.map(node => ({
    id: node.id,
    width: node.width || NODE_CONFIG.default.width,
    height: node.height || NODE_CONFIG.default.height,
  }));

  // Convert React Flow edges to ELK edges
  const elkEdges = edges.map(edge => ({
    id: edge.id,
    sources: [edge.source],
    targets: [edge.target],
  }));

  try {
    // Use retry logic for layout calculation
    const layoutedNodes = await withRetry(
      async () => {
        // Run ELK layout
        const layouted = await elk.layout({
          id: 'root',
          children: elkNodes,
          edges: elkEdges,
          layoutOptions: elkOptions,
        });

        // Apply positions back to React Flow nodes
        return nodes.map(node => {
          const elkNode = layouted.children?.find(n => n.id === node.id);
          if (!elkNode) {
            return node;
          }

          return {
            ...node,
            position: {
              x: elkNode.x || 0,
              y: elkNode.y || 0,
            },
          };
        });
      },
      {
        maxAttempts: LAYOUT_CONFIG.retry.maxAttempts,
        delayMs: LAYOUT_CONFIG.retry.delayMs,
        onRetry: (attempt, error) => {
          console.warn(`[Layout] Retry attempt ${attempt} after error:`, error.message);
        },
      }
    );

    // Cache the result
    layoutCache.set(cacheKey, layoutedNodes);
    
    return layoutedNodes;
  } catch (error) {
    console.error('Error applying ELK layout:', error);
    errorLogger.log(
      new LayoutError('ELK layout failed', nodes.length, edges.length),
      'error',
      { error: error instanceof Error ? error.message : String(error) }
    );
    
    // Try fallback layout
    return ErrorRecovery.tryWithFallback(
      async () => {
        throw error; // Re-throw to trigger fallback
      },
      async () => applyFallbackLayout(nodes, edges),
      (err) => {
        console.log('[Layout] Falling back to grid layout due to:', err.message);
      }
    );
  } finally {
    perfMonitor.endMeasure('elk-layout', nodes.length, edges.length);
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
  const basePadding = NODE_CONFIG.text.basePadding;
  const charWidth = NODE_CONFIG.text.charWidth;
  const lineHeight = NODE_CONFIG.text.lineHeight;
  
  // Calculate based on content
  let functionNameLength = 0;
  let summaryLength = 0;
  
  if (isCodeNode(node)) {
    const data = node.data as CodeNodeData;
    functionNameLength = (data.function_name || '').length;
    summaryLength = (data.summary || '').length;
  } else if (isModuleNode(node)) {
    const data = node.data as ModuleNodeData;
    functionNameLength = (data.module_name || '').length;
    summaryLength = (data.description || '').length;
  }
  
  // Width calculation (with max/min constraints)
  const minWidth = NODE_CONFIG.constraints.minWidth;
  const maxWidth = NODE_CONFIG.constraints.maxWidth;
  const calculatedWidth = Math.max(functionNameLength * charWidth, summaryLength * charWidth / 3) + basePadding * 2;
  const width = Math.min(Math.max(calculatedWidth, minWidth), maxWidth);
  
  // Height calculation based on text wrapping
  const summaryLines = Math.ceil((summaryLength * charWidth) / (width - basePadding * 2));
  const height = basePadding * 2 + lineHeight * 2 + (summaryLines * lineHeight);
  
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
  
  const GRID_SPACING_X = LAYOUT_CONFIG.grid.spacingX;
  const GRID_SPACING_Y = LAYOUT_CONFIG.grid.spacingY;
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
    adjacency.get(edge.source)!.add(edge.target);
    adjacency.get(edge.target)!.add(edge.source);
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
  let currentX = 0;
  let currentY = 0;
  let rowHeight = 0;
  
  // Layout each group
  nodeGroups.forEach((group, groupId) => {
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