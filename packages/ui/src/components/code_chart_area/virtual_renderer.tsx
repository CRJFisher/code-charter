import React, { useMemo } from 'react';
import { Node, Edge } from '@xyflow/react';
import { CodeChartNode, CodeChartEdge } from './react_flow_types';

export interface VirtualRendererProps {
  nodes: CodeChartNode[];
  edges: CodeChartEdge[];
  visibleNodeIds: Set<string>;
  renderBuffer?: number;
}

/**
 * Virtual rendering component that filters nodes and edges based on visibility
 * This significantly improves performance for large graphs
 */
export function useVirtualNodes({
  nodes,
  edges,
  visibleNodeIds,
  renderBuffer = 50,
}: VirtualRendererProps): {
  virtualNodes: CodeChartNode[];
  virtualEdges: CodeChartEdge[];
  hiddenNodeCount: number;
} {
  // Memoize virtual nodes to prevent unnecessary recalculations
  const virtualNodes = useMemo(() => {
    if (visibleNodeIds.size === 0) {
      return nodes; // Return all nodes if no visibility info
    }
    
    // Add buffer nodes (nodes connected to visible nodes)
    const expandedVisibleIds = new Set(visibleNodeIds);
    
    if (renderBuffer > 0) {
      edges.forEach(edge => {
        if (visibleNodeIds.has(edge.source)) {
          expandedVisibleIds.add(edge.target);
        }
        if (visibleNodeIds.has(edge.target)) {
          expandedVisibleIds.add(edge.source);
        }
      });
    }
    
    return nodes.filter(node => expandedVisibleIds.has(node.id));
  }, [nodes, visibleNodeIds, edges, renderBuffer]);
  
  // Memoize virtual edges
  const virtualEdges = useMemo(() => {
    if (visibleNodeIds.size === 0) {
      return edges; // Return all edges if no visibility info
    }
    
    const nodeIdSet = new Set(virtualNodes.map(n => n.id));
    
    // Only include edges where both source and target are rendered
    return edges.filter(edge => 
      nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)
    );
  }, [edges, virtualNodes, visibleNodeIds]);
  
  const hiddenNodeCount = nodes.length - virtualNodes.length;
  
  return {
    virtualNodes,
    virtualEdges,
    hiddenNodeCount,
  };
}

/**
 * Placeholder component for nodes that are outside viewport
 * This can be used to show indicators at the edges of the viewport
 */
export interface ViewportIndicatorProps {
  direction: 'top' | 'bottom' | 'left' | 'right';
  count: number;
  onClick?: () => void;
}

export const ViewportIndicator: React.FC<ViewportIndicatorProps> = React.memo(({ 
  direction, 
  count, 
  onClick 
}) => {
  if (count === 0) return null;
  
  const positionStyles: React.CSSProperties = {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: 'white',
    padding: '8px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: onClick ? 'pointer' : 'default',
    zIndex: 10,
    ...getPositionStyle(direction),
  };
  
  return (
    <div 
      style={positionStyles}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${count} nodes ${direction} of viewport`}
    >
      {count} nodes {getArrow(direction)}
    </div>
  );
});

function getPositionStyle(direction: string): React.CSSProperties {
  switch (direction) {
    case 'top':
      return { top: 20, left: '50%', transform: 'translateX(-50%)' };
    case 'bottom':
      return { bottom: 20, left: '50%', transform: 'translateX(-50%)' };
    case 'left':
      return { left: 20, top: '50%', transform: 'translateY(-50%)' };
    case 'right':
      return { right: 20, top: '50%', transform: 'translateY(-50%)' };
    default:
      return {};
  }
}

function getArrow(direction: string): string {
  switch (direction) {
    case 'top': return '↑';
    case 'bottom': return '↓';
    case 'left': return '←';
    case 'right': return '→';
    default: return '';
  }
}

/**
 * Performance optimization hook that provides node culling based on zoom level
 */
export function useZoomCulling(
  nodes: CodeChartNode[],
  zoom: number,
  threshold: number = 0.3
): CodeChartNode[] {
  return useMemo(() => {
    if (zoom >= threshold) {
      return nodes; // Show all nodes when zoomed in
    }
    
    // When zoomed out, only show important nodes
    return nodes.filter(node => {
      // Always show entry points
      if (node.data?.is_entry_point) return true;
      
      // Show module nodes
      if (node.type === 'module_group') return true;
      
      // For other nodes, use a sampling strategy
      // This could be enhanced with importance scoring
      const hash = node.id.split('').reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0);
      }, 0);
      
      // Show approximately 30% of nodes when zoomed out
      return Math.abs(hash) % 10 < 3;
    });
  }, [nodes, zoom, threshold]);
}

/**
 * Level of Detail (LOD) system for nodes
 */
export type NodeLOD = 'full' | 'simplified' | 'minimal';

export function getNodeLOD(zoom: number): NodeLOD {
  if (zoom >= 0.8) return 'full';
  if (zoom >= 0.4) return 'simplified';
  return 'minimal';
}

/**
 * Progressive loading hook for large graphs
 */
export function useProgressiveLoading<T>(
  items: T[],
  batchSize: number = 50,
  delay: number = 0
): {
  loadedItems: T[];
  isLoading: boolean;
  progress: number;
} {
  const [loadedCount, setLoadedCount] = React.useState(
    Math.min(batchSize, items.length)
  );
  
  React.useEffect(() => {
    if (loadedCount >= items.length) return;
    
    const timer = setTimeout(() => {
      setLoadedCount(prev => Math.min(prev + batchSize, items.length));
    }, delay);
    
    return () => clearTimeout(timer);
  }, [loadedCount, items.length, batchSize, delay]);
  
  return {
    loadedItems: items.slice(0, loadedCount),
    isLoading: loadedCount < items.length,
    progress: items.length > 0 ? loadedCount / items.length : 1,
  };
}