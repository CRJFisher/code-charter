import React, { useMemo } from 'react';
import { CodeChartNode, CodeChartEdge } from './chart_types';
import { CONFIG } from './chart_config';

interface ViewportNode {
  id: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

export function get_visible_nodes(
  nodes: ViewportNode[],
  viewport: { x: number; y: number; zoom: number },
  container_width: number,
  container_height: number,
  buffer = 100
): Set<string> {
  const visible_node_ids = new Set<string>();

  const view_bounds = {
    left: -viewport.x / viewport.zoom - buffer,
    right: (-viewport.x + container_width) / viewport.zoom + buffer,
    top: -viewport.y / viewport.zoom - buffer,
    bottom: (-viewport.y + container_height) / viewport.zoom + buffer,
  };

  nodes.forEach(node => {
    const node_right = node.position.x + (node.width || 200);
    const node_bottom = node.position.y + (node.height || 100);

    if (
      node.position.x <= view_bounds.right &&
      node_right >= view_bounds.left &&
      node.position.y <= view_bounds.bottom &&
      node_bottom >= view_bounds.top
    ) {
      visible_node_ids.add(node.id);
    }
  });

  return visible_node_ids;
}

export interface VirtualRendererProps {
  nodes: CodeChartNode[];
  edges: CodeChartEdge[];
  visible_node_ids: Set<string>;
  render_buffer?: number;
}

export function use_virtual_nodes({
  nodes,
  edges,
  visible_node_ids,
  render_buffer = CONFIG.performance.virtualRender.defaultBuffer,
}: VirtualRendererProps): {
  virtual_nodes: CodeChartNode[];
  virtual_edges: CodeChartEdge[];
  hidden_node_count: number;
} {
  const virtual_nodes = useMemo(() => {
    // An empty visibility set means culling is off: render everything.
    if (visible_node_ids.size === 0) {
      return nodes;
    }

    // Pull in nodes adjacent to visible ones so edges crossing the viewport
    // edge still have both endpoints to attach to.
    const expanded_visible_ids = new Set(visible_node_ids);
    
    if (render_buffer > 0) {
      edges.forEach(edge => {
        if (visible_node_ids.has(edge.source)) {
          expanded_visible_ids.add(edge.target);
        }
        if (visible_node_ids.has(edge.target)) {
          expanded_visible_ids.add(edge.source);
        }
      });
    }
    
    return nodes.filter(node => expanded_visible_ids.has(node.id));
  }, [nodes, visible_node_ids, edges, render_buffer]);
  
  const virtual_edges = useMemo(() => {
    if (visible_node_ids.size === 0) {
      return edges;
    }

    const node_id_set = new Set(virtual_nodes.map(n => n.id));

    return edges.filter(edge =>
      node_id_set.has(edge.source) && node_id_set.has(edge.target)
    );
  }, [edges, virtual_nodes, visible_node_ids]);
  
  const hidden_node_count = nodes.length - virtual_nodes.length;
  
  return {
    virtual_nodes,
    virtual_edges,
    hidden_node_count,
  };
}

export interface ViewportIndicatorProps {
  direction: 'top' | 'bottom' | 'left' | 'right';
  count: number;
  on_click?: () => void;
}

const ViewportIndicatorImpl: React.FC<ViewportIndicatorProps> = ({
  direction,
  count,
  on_click,
}) => {
  if (count === 0) return null;
  
  const position_styles: React.CSSProperties = {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: '#ffffff',
    padding: `${CONFIG.spacing.padding.medium}px ${CONFIG.spacing.padding.medium + 4}px`,
    borderRadius: `${CONFIG.spacing.borderRadius.medium}px`,
    fontSize: `${CONFIG.spacing.fontSize.medium}px`,
    cursor: on_click ? 'pointer' : 'default',
    zIndex: CONFIG.zIndex.overlay,
    ...get_position_style(direction),
  };
  
  return (
    <div 
      style={position_styles}
      onClick={on_click}
      role={on_click ? 'button' : undefined}
      tabIndex={on_click ? 0 : undefined}
      aria-label={`${count} nodes ${direction} of viewport`}
    >
      {count} nodes {get_arrow(direction)}
    </div>
  );
};
ViewportIndicatorImpl.displayName = 'ViewportIndicator';
export const ViewportIndicator = React.memo(ViewportIndicatorImpl);

function get_position_style(direction: string): React.CSSProperties {
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

function get_arrow(direction: string): string {
  switch (direction) {
    case 'top': return '↑';
    case 'bottom': return '↓';
    case 'left': return '←';
    case 'right': return '→';
    default: return '';
  }
}
