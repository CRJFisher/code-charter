# Cytoscape.js Functionality Documentation

This document provides a comprehensive overview of the existing Cytoscape.js implementation in the Code Charter UI package, specifically focusing on the `code_chart_area.tsx` component and related files.

## Overview

The current implementation uses Cytoscape.js to visualize code call graphs with the following key features:
- Function call graph visualization with hierarchical layout
- Interactive nodes showing function summaries
- Zoom-based visibility control (showing high-level modules when zoomed out)
- Click-to-navigate functionality to open files in VS Code

## Core Components

### 1. Main Component: `CodeChartArea` (code_chart_area.tsx)

**Purpose**: Renders the interactive code call graph visualization using Cytoscape.js

**Key Props**:
- `selectedEntryPoint: CallGraphNode | null` - The root function to visualize
- `screenWidthFraction: number` - Width of the visualization area
- `getSummaries: (nodeSymbol: string) => Promise<TreeAndContextSummaries | undefined>` - Fetches function summaries
- `detectModules: () => Promise<NodeGroup[] | undefined>` - Detects high-level code modules
- `indexingStatus: CodeIndexStatus` - Current code indexing status

**State Management**:
- `elements`: Cytoscape element definitions (nodes and edges)
- `nodePlacements`: Layout constraints for node positioning
- `zoomMode`: Current zoom state ('zoomedIn' | 'zoomedOut')
- `callGraphNodes`: Map of function nodes
- `summaryStatus`: Loading state for summaries

### 2. Node Generation and Placement (node_placement.ts)

#### `generateElements` Function
Creates Cytoscape element definitions from the call graph data:
- **Regular Nodes**: Function nodes with summaries
- **Top-Level Node**: Entry point with special styling (⮕ prefix)
- **Compound Nodes**: Module/cluster containers
- **Edges**: Function call relationships
- **Compound Edges**: Module-to-module dependencies

#### `generateRelativePlacementConstraints` Function
Calculates layout constraints for the fcose (fast Compound Spring Embedder) layout:
- **Top-Bottom Constraints**: Parent functions above their callees
- **Left-Right Constraints**: Sibling functions arranged horizontally
- **Compound Constraints**: Module-level dependencies
- **Cycle Detection**: Prevents circular layout constraints

### 3. Styling (cytoscapeStyles.ts)

Defines visual styles for all graph elements:
- **Node Styles**: Background colors, borders, padding, text formatting
- **Edge Styles**: Line colors, arrow styles, widths
- **Compound Node Styles**: Container styling for modules
- **Interactive States**: Selected, hovered, hidden states
- **Theme Integration**: Uses VS Code color theme variables

## Key Features Implementation

### 1. Function Call Graph Display

**Implementation**:
```typescript
// Node creation with function summary
elements.push({
  data: {
    id: node.symbol,
    label: `${symbolDisplayName(node.symbol)}\n\n${summary}`,
    document: node.definition.file_path,
    range: node.definition.range,
    parent: compoundId, // Module assignment
  },
  classes: isTopLevel ? "top-level-node" : "node",
});
```

**Features**:
- Each node displays function name and AI-generated summary
- Nodes are assigned to compound nodes (modules) if clustering is detected
- Special styling for entry point nodes

### 2. Zoom-Based Visibility Control

**Implementation**:
```typescript
function applyZoomMode(cy: Core, zoomMode: ZoomMode, nodeGroupsRef) {
  if (zoomMode === "zoomedOut" && (currentNodeGroups || []).length > 0) {
    // Show only compound nodes
    cy.elements(".compound").removeClass("hidden");
    cy.elements(".compound-edge").removeClass("hidden");
    cy.elements(".node").addClass("hidden");
    cy.elements(".edge").addClass("hidden");
  } else if (zoomMode === "zoomedIn") {
    // Show all nodes
    cy.elements(".node").removeClass("hidden");
    cy.elements(".edge").removeClass("hidden");
    cy.elements(".compound-edge").addClass("hidden");
  }
}
```

**Zoom Threshold**: 0.45
- Below threshold: Shows only high-level modules
- Above threshold: Shows individual functions

### 3. Click-to-Navigate

**Implementation**:
```typescript
cy.on("click", "node", async function (event) {
  const node = event.target;
  const definitionNode = callGraphNodes ? callGraphNodes[node.id()] : null;
  if (!definitionNode) return;
  
  await navigateToDoc(
    definitionNode.definition.file_path, 
    definitionNode.definition.range.start.row
  );
  
  cy.animate({
    zoom: 1,
    center: { eles: node },
    duration: 200,
    easing: "ease-in-out",
  });
});
```

**Behavior**:
- Clicking a node opens the file in VS Code at the function definition
- Animates zoom to focus on the clicked node

### 4. Layout Algorithm

**Layout Configuration**:
```typescript
const layoutOptions: FcoseLayoutOptions = {
  name: "fcose",
  animate: true,
  animationDuration: 500,
  nodeDimensionsIncludeLabels: true,
  fit: true,
  nodeRepulsion: 100000,
  idealEdgeLength: 50,
  edgeElasticity: 0.1,
  gravity: 0,
  numIter: 2500,
  randomize: false,
  relativePlacementConstraint: nodePlacements,
};
```

**Features**:
- Uses fcose (fast Compound Spring Embedder) for hierarchical layout
- Supports relative placement constraints for better organization
- Animated transitions between layouts

### 5. Loading States

**Progressive Loading**:
1. "Indexing..." - While code is being parsed
2. "Summarising functions..." - AI generating function summaries
3. "Detecting modules..." - Clustering algorithm running
4. Ready state - Full interactive visualization

## Data Flow

1. **Entry Point Selection**: User selects a function to visualize
2. **Data Fetching**: 
   - Fetch function summaries via `getSummaries()`
   - Detect module clusters via `detectModules()`
3. **Graph Generation**:
   - Generate nodes and edges via `generateElements()`
   - Calculate layout constraints via `generateRelativePlacementConstraints()`
4. **Rendering**: Cytoscape renders the graph with fcose layout
5. **Interaction**: User can zoom, pan, and click nodes

## Technical Considerations

### Performance
- Uses viewport culling (only renders visible elements)
- Batch updates for zoom mode changes
- Proper cleanup on component unmount

### State Management
- Uses React refs for zoom mode to avoid stale closures
- Stores node groups in ref for event handlers
- Proper Cytoscape instance lifecycle management

### Responsiveness
- Window resize handler updates container dimensions
- Viewport fits graph on resize
- Width controlled by `screenWidthFraction` prop

## Current Limitations

1. **Custom Node Content**: Cytoscape makes it difficult to embed rich HTML/React components in nodes
2. **Layout Flexibility**: Limited control over exact node positioning
3. **Performance**: Can slow down with very large graphs (>1000 nodes)
4. **Styling**: CSS-based styling is less flexible than component-based approaches