import callGraph from '../../examples/gpt-researcher/call_graph.json';
import summaries from '../../examples/gpt-researcher/summaries.json';

import 'reactflow/dist/style.css';
import ELK, { LayoutOptions } from 'elkjs/lib/elk.bundled.js';
import { ElkNode } from 'elkjs/lib/elk.bundled.js';
import React, { useEffect } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Node,
  Edge,
  Background,
} from 'reactflow';
import CodeNode from './CodeNode';
import { CustomNodeData } from './Types';

interface CallGraphNodesAndEdges {
  nodes: Node<CustomNodeData>[];
  edges: Edge[];
}

const callGraphToNodesAndEdges = (callGraph: any): CallGraphNodesAndEdges => {

  const nodeIdToNodeMap = new Map<string, Node<CustomNodeData>>();
  const edgeIdToEdgeMap = new Map<string, Edge>();
  // BFS over callGraph, keeping track of nodes and edges
  const queue = [callGraph[0]];
  while (queue.length > 0) {
    const node = queue.shift();
    const nodeId = node.symbol;

    const nodeData: CustomNodeData = { symbol: node.symbol, summary: '' };
    const rfNode: Node<CustomNodeData> = {
      id: nodeId,
      type: 'default',
      position: { x: 0, y: 0 },
      data: nodeData,
    };
    nodeIdToNodeMap.set(nodeId, rfNode);
    if (!node.definition_node) {
      throw new Error(`No definition node for ${node} queue: ${queue}`);
    }
    node.children?.forEach((child: any) => {
      const childId = child.symbol;
      const edgeId = `${nodeId}-${childId}`;
      const rfEdge: Edge = {
        id: edgeId,
        source: nodeId,
        target: childId,
        // type: 'bezier',
        animated: true
      };
      edgeIdToEdgeMap.set(edgeId, rfEdge);
    });
    queue.push(...node.children);
  }
  const nodes = Array.from(nodeIdToNodeMap.values());
  const edges = Array.from(edgeIdToEdgeMap.values());
  return { nodes, edges };
}


const elk = new ELK();


const useLayoutedElements = () => {
  const { getNodes, setNodes, getEdges, fitView } = useReactFlow();

  const defaultOptions: LayoutOptions = {
    'elk.algorithm': 'layered',
    'elk.layered.spacing.nodeNodeBetweenLayers': "100",
    'elk.spacing.nodeNode': "100",
  };
  const getLayoutedElements = React.useCallback((options: LayoutOptions) => {

    const layoutOptions: LayoutOptions = { ...defaultOptions, ...options };
    const callGraphNodes = getNodes();
    const graph: ElkNode = {
      id: 'root',
      children: callGraphNodes.map((node) => {
        return {
          ...node,
          labels: [{ text: node.id }],
          width: node.width || 100,
          height: node.height || 100,
          ports: [
            { id: 'port1', width: 10, height: 10, x: 0, y: 0 },
            { id: 'port2', width: 10, height: 10, x: 0, y: 0 },
          ],
        };
      }
      ),
      edges: getEdges().map((edge) => {
        return {
          ...edge,
          sources: [edge.source],
          targets: [edge.target],
        };
      }),
      layoutOptions: layoutOptions
    };

    const summariesMap = new Map<string, string>(Object.entries(summaries));

    elk.layout(graph).then(({ children }: { children?: ElkNode[] }) => {
      const layoutedNodes = children?.map((node, i) => ({
        id: node.id,
        position: { x: node.x || 0, y: node.y || 0 },
        type: 'codeNode',
        style: { border: '3px solid #777', padding: 10, borderRadius: 25},
        data: { symbol: node.id, summary: summariesMap.get(node.id) || '' },
      })) || [];
      // const rfNode = ;
      // rfNode.position = { x: node.x || 0, y: node.y || 0 };
      // return rfNode;
      setNodes(layoutedNodes);

      window.requestAnimationFrame(() => {
        fitView();
      });
    });
  }, [defaultOptions, getNodes, getEdges, setNodes, fitView]);

  return { getLayoutedElements };
};

const nodeTypes = { codeNode: CodeNode };

const LayoutFlow: React.FC = () => {
  const callGraphNodesAndEdges = callGraphToNodesAndEdges(callGraph);
  const [nodes, , onNodesChange] = useNodesState(callGraphNodesAndEdges.nodes);
  const [edges, , onEdgesChange] = useEdgesState(callGraphNodesAndEdges.edges);
  const { getLayoutedElements } = useLayoutedElements();
  const { fitView } = useReactFlow();
  useEffect(() => {
    getLayoutedElements({ 'elk.algorithm': 'layered', 'elk.direction': 'DOWN' });
  }, []);

  return (
    <div className="react-flow__node-selectorNode container" style={{ height: 900 }}>
      <ReactFlow

        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        // Use the defined nodeTypes here
        nodeTypes={nodeTypes}
        fitView
        snapToGrid={true}
        // snapGrid={snapGrid}
        // defaultViewport={defaultViewport}
        attributionPosition="bottom-left"
        minZoom={0.1}
      >
        <div style={{ position: 'absolute', right: '10px', top: '10px', zIndex: 10 }}>
          <button onClick={() => getLayoutedElements({ 'elk.algorithm': 'layered', 'elk.direction': 'DOWN' })}>
            vertical layout
          </button>

        </div>
        <Background />
      </ReactFlow>
    </div>
  );
};

const LayoutWrapper = () => {
  return (
    <ReactFlowProvider>
      <LayoutFlow />
    </ReactFlowProvider>
  );
}


export default LayoutWrapper;



