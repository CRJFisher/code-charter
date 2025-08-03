# React Flow Implementation Guide for Code Call Graph

This document outlines how to implement all the existing Cytoscape.js functionality using React Flow, based on the research from the visualization library analysis.

## Overview

React Flow is a React-native graph visualization library that provides:
- Native React component architecture
- Custom nodes as React components
- Flexible layout integration
- Built-in interactivity
- Excellent performance with viewport culling

## Implementation Mapping

### 1. Function Call Graph Display with Summaries

**Cytoscape Approach**: CSS-styled nodes with text labels
**React Flow Approach**: Custom React components for nodes

```tsx
// Custom node component
import { Handle, Position } from '@xyflow/react';

interface CodeNodeData {
  functionName: string;
  summary: string;
  filePath: string;
  lineNumber: number;
  isEntryPoint?: boolean;
}

function CodeFunctionNode({ data }: { data: CodeNodeData }) {
  return (
    <div className="code-function-node">
      <Handle type="target" position={Position.Top} />
      
      <div className="node-header">
        {data.isEntryPoint && <span className="entry-arrow">⮕ </span>}
        <span className="function-name">{data.functionName}</span>
      </div>
      
      <div className="node-summary">
        {data.summary}
      </div>
      
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// Node types registration
const nodeTypes = {
  codeFunction: CodeFunctionNode,
};
```

### 2. Module/Cluster Visualization

**Cytoscape Approach**: Compound nodes with parent-child relationships
**React Flow Approach**: Group nodes or background elements

```tsx
// Module group node
function ModuleGroupNode({ data }: { data: { description: string } }) {
  return (
    <div className="module-group-node">
      <div className="module-description">{data.description}</div>
    </div>
  );
}

// Alternative: Use React Flow's built-in grouping
const nodes = [
  {
    id: 'module-1',
    type: 'group',
    position: { x: 0, y: 0 },
    style: {
      width: 400,
      height: 300,
      backgroundColor: 'rgba(240, 240, 240, 0.5)',
    },
    data: { label: 'Authentication Module' },
  },
  {
    id: 'func-1',
    type: 'codeFunction',
    position: { x: 50, y: 50 },
    parentNode: 'module-1',
    extent: 'parent',
    data: { functionName: 'login', summary: '...' },
  },
];
```

### 3. Zoom-Based Visibility Control

**Cytoscape Approach**: CSS class toggling based on zoom events
**React Flow Approach**: useStore hook with conditional rendering

```tsx
import { useStore, ReactFlowState } from '@xyflow/react';

// Zoom-aware node component
function ZoomAwareNode({ data, id }: { data: CodeNodeData; id: string }) {
  const zoom = useStore((state: ReactFlowState) => state.transform[2]);
  const isZoomedOut = zoom < 0.5;
  
  if (isZoomedOut) {
    // Show simplified view when zoomed out
    return (
      <div className="node-zoomed-out">
        <Handle type="target" position={Position.Top} />
        <div className="node-count">{data.childCount} functions</div>
        <Handle type="source" position={Position.Bottom} />
      </div>
    );
  }
  
  // Show full detail when zoomed in
  return <CodeFunctionNode data={data} />;
}

// Alternative: Control visibility at the graph level
function CodeGraph() {
  const [nodes, setNodes] = useNodesState(initialNodes);
  const zoom = useStore((state: ReactFlowState) => state.transform[2]);
  
  useEffect(() => {
    const updatedNodes = nodes.map(node => ({
      ...node,
      hidden: zoom < 0.5 && node.type === 'codeFunction',
    }));
    setNodes(updatedNodes);
  }, [zoom]);
  
  return <ReactFlow nodes={nodes} />;
}
```

### 4. Click-to-Navigate Functionality

**Cytoscape Approach**: Event listener on node clicks
**React Flow Approach**: onClick handler in custom node component

```tsx
function CodeFunctionNode({ data }: { data: CodeNodeData }) {
  const handleOpenInEditor = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node selection
    
    // VS Code URL scheme
    const vscodeUrl = `vscode://file/${data.filePath}:${data.lineNumber}`;
    window.open(vscodeUrl, '_blank');
  };
  
  return (
    <div className="code-function-node">
      <Handle type="target" position={Position.Top} />
      
      <div className="node-content">
        <div className="function-name">{data.functionName}</div>
        <button 
          className="open-in-editor-btn"
          onClick={handleOpenInEditor}
          title={`Open ${data.filePath}:${data.lineNumber}`}
        >
          📂 Open
        </button>
      </div>
      
      <div className="node-summary">{data.summary}</div>
      
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
```

### 5. Automatic Layout

**Cytoscape Approach**: Built-in fcose layout
**React Flow Approach**: Integration with external layout libraries

```tsx
import ELK from 'elkjs/lib/elk.bundled.js';
import { useReactFlow } from '@xyflow/react';

const elk = new ELK();

// Layout options for hierarchical call graph
const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '50',
  'elk.layered.spacing.nodeNodeBetweenLayers': '100',
};

async function layoutGraph(nodes: Node[], edges: Edge[]) {
  const elkNodes = nodes.map(node => ({
    id: node.id,
    width: node.width || 150,
    height: node.height || 100,
  }));
  
  const elkEdges = edges.map(edge => ({
    id: edge.id,
    sources: [edge.source],
    targets: [edge.target],
  }));
  
  const layouted = await elk.layout({
    id: 'root',
    children: elkNodes,
    edges: elkEdges,
    layoutOptions: elkOptions,
  });
  
  // Apply positions back to React Flow nodes
  return nodes.map(node => {
    const elkNode = layouted.children?.find(n => n.id === node.id);
    return {
      ...node,
      position: {
        x: elkNode?.x || 0,
        y: elkNode?.y || 0,
      },
    };
  });
}

// Usage in component
function CodeGraph() {
  const { setNodes } = useReactFlow();
  const [nodes, edges] = useState(initialData);
  
  useEffect(() => {
    layoutGraph(nodes, edges).then(layoutedNodes => {
      setNodes(layoutedNodes);
    });
  }, [nodes, edges]);
}
```

### 6. State Serialization

**Cytoscape Approach**: Manual extraction of positions
**React Flow Approach**: Built-in toObject method

```tsx
import { useReactFlow } from '@xyflow/react';

function SaveLoadControls() {
  const { toObject, setNodes, setEdges, setViewport } = useReactFlow();
  
  const handleSave = () => {
    const graphState = toObject();
    localStorage.setItem('codeGraph', JSON.stringify(graphState));
  };
  
  const handleLoad = () => {
    const saved = localStorage.getItem('codeGraph');
    if (saved) {
      const { nodes, edges, viewport } = JSON.parse(saved);
      setNodes(nodes);
      setEdges(edges);
      setViewport(viewport);
    }
  };
  
  return (
    <>
      <button onClick={handleSave}>Save Graph</button>
      <button onClick={handleLoad}>Load Graph</button>
    </>
  );
}
```

### 7. Loading States

**Implementation**: Progress indicators during data fetching

```tsx
function CodeGraphContainer() {
  const [status, setStatus] = useState<'indexing' | 'summarizing' | 'clustering' | 'ready'>('indexing');
  
  if (status !== 'ready') {
    return (
      <div className="loading-container">
        <VSCodeProgressRing />
        <div className="status-message">
          {status === 'indexing' && 'Indexing code...'}
          {status === 'summarizing' && 'Summarizing functions...'}
          {status === 'clustering' && 'Detecting modules...'}
        </div>
      </div>
    );
  }
  
  return <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} />;
}
```

## Advanced Features

### 1. Mini Map

```tsx
import { MiniMap } from '@xyflow/react';

<ReactFlow>
  <MiniMap 
    nodeColor={node => {
      if (node.type === 'module') return '#f0f0f0';
      if (node.data?.isEntryPoint) return '#4CAF50';
      return '#2196F3';
    }}
    style={{
      backgroundColor: '#f8f8f8',
    }}
  />
</ReactFlow>
```

### 2. Controls

```tsx
import { Controls } from '@xyflow/react';

<ReactFlow>
  <Controls />
</ReactFlow>
```

### 3. Performance Optimization

```tsx
<ReactFlow
  nodes={nodes}
  edges={edges}
  nodeTypes={nodeTypes}
  // Only render visible elements
  onlyRenderVisibleElements
  // Disable node dragging for better performance
  nodesDraggable={false}
  // Optimize for pan/zoom
  panOnScroll
  zoomOnDoubleClick={false}
/>
```

## Migration Strategy

1. **Phase 1**: Basic node and edge rendering
   - Convert Cytoscape elements to React Flow nodes/edges
   - Implement custom CodeFunctionNode component
   - Basic styling

2. **Phase 2**: Layout integration
   - Integrate ELK.js for hierarchical layout
   - Port fcose-like constraints to ELK configuration
   - Handle layout animations

3. **Phase 3**: Interactivity
   - Implement click-to-navigate
   - Add zoom-based visibility
   - Node selection and highlighting

4. **Phase 4**: Advanced features
   - Module grouping
   - State persistence
   - Performance optimizations

## Key Advantages of React Flow

1. **Developer Experience**: Native React patterns, hooks, and components
2. **Customization**: Full control over node rendering with React components
3. **Performance**: Built-in viewport culling and optimizations
4. **Ecosystem**: Rich set of examples and community support
5. **Maintenance**: Actively maintained with commercial backing

## Potential Challenges

1. **Layout Engine**: Need to integrate external library (ELK.js recommended)
2. **Learning Curve**: Different API from Cytoscape
3. **Migration Effort**: Complete rewrite of visualization component
4. **Testing**: Need new test strategies for React components