import ELK from 'elkjs/lib/elk.bundled.js';
import { Node, Edge } from '@xyflow/react';

const elk = new ELK();

// ELK layout options for hierarchical call graph
const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '50',
  'elk.layered.spacing.nodeNodeBetweenLayers': '100',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.unnecessaryBendpoints': 'true',
  'elk.layered.spacing.edgeNodeBetweenLayers': '30',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
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
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Promise<Node[]> {
  // If no nodes, return empty array
  if (nodes.length === 0) {
    return [];
  }

  // Convert React Flow nodes to ELK nodes
  const elkNodes = nodes.map(node => ({
    id: node.id,
    width: node.width || 250,
    height: node.height || 120,
  }));

  // Convert React Flow edges to ELK edges
  const elkEdges = edges.map(edge => ({
    id: edge.id,
    sources: [edge.source],
    targets: [edge.target],
  }));

  try {
    // Run ELK layout
    const layouted = await elk.layout({
      id: 'root',
      children: elkNodes,
      edges: elkEdges,
      layoutOptions: elkOptions,
    });

    // Apply positions back to React Flow nodes
    const layoutedNodes = nodes.map(node => {
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

    return layoutedNodes;
  } catch (error) {
    console.error('Error applying ELK layout:', error);
    // Return original nodes if layout fails
    return nodes;
  }
}

// Helper function to calculate node dimensions based on content
export function calculateNodeDimensions(node: Node): { width: number; height: number } {
  // Base dimensions
  const basePadding = 20;
  const charWidth = 8; // Average character width
  const lineHeight = 20;
  
  // Calculate based on content
  const data = node.data as any;
  const functionNameLength = (data.function_name || '').length;
  const summaryLength = (data.summary || '').length;
  
  // Width calculation (with max/min constraints)
  const minWidth = 200;
  const maxWidth = 350;
  const calculatedWidth = Math.max(functionNameLength * charWidth, summaryLength * charWidth / 3) + basePadding * 2;
  const width = Math.min(Math.max(calculatedWidth, minWidth), maxWidth);
  
  // Height calculation based on text wrapping
  const summaryLines = Math.ceil((summaryLength * charWidth) / (width - basePadding * 2));
  const height = basePadding * 2 + lineHeight * 2 + (summaryLines * lineHeight);
  
  return { width, height };
}