import React, { useMemo } from 'react';
import { CodeChartNode, CodeChartEdge } from './chart_types';
import { CONFIG } from './chart_config';

// Virtualization helper to determine visible nodes
export function getVisibleNodes(
  nodes: any[],
  viewport: { x: number; y: number; zoom: number },
  containerWidth: number,
  containerHeight: number,
  buffer: number = 100
): Set<string> {
  const visibleNodeIds = new Set<string>();

  // Calculate viewport bounds with buffer
  const viewBounds = {
    left: -viewport.x / viewport.zoom - buffer,
    right: (-viewport.x + containerWidth) / viewport.zoom + buffer,
    top: -viewport.y / viewport.zoom - buffer,
    bottom: (-viewport.y + containerHeight) / viewport.zoom + buffer,
  };

  // Check each node if it's within viewport
  nodes.forEach(node => {
    const nodeRight = node.position.x + (node.width || 200);
    const nodeBottom = node.position.y + (node.height || 100);

    if (
      node.position.x <= viewBounds.right &&
      nodeRight >= viewBounds.left &&
      node.position.y <= viewBounds.bottom &&
      nodeBottom >= viewBounds.top
    ) {
      visibleNodeIds.add(node.id);
    }
  });

  return visibleNodeIds;
}

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
  renderBuffer = CONFIG.performance.virtualRender.defaultBuffer,
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
    color: '#ffffff',
    padding: `${CONFIG.spacing.padding.medium}px ${CONFIG.spacing.padding.medium + 4}px`,
    borderRadius: `${CONFIG.spacing.borderRadius.medium}px`,
    fontSize: `${CONFIG.spacing.fontSize.medium}px`,
    cursor: onClick ? 'pointer' : 'default',
    zIndex: CONFIG.zIndex.overlay,
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
      return { top: CONFIG.viewport.indicators.position.offset, left: '50%', transform: CONFIG.viewport.indicators.position.transform.horizontal };
    case 'bottom':
      return { bottom: CONFIG.viewport.indicators.position.offset, left: '50%', transform: CONFIG.viewport.indicators.position.transform.horizontal };
    case 'left':
      return { left: CONFIG.viewport.indicators.position.offset, top: '50%', transform: CONFIG.viewport.indicators.position.transform.vertical };
    case 'right':
      return { right: CONFIG.viewport.indicators.position.offset, top: '50%', transform: CONFIG.viewport.indicators.position.transform.vertical };
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
