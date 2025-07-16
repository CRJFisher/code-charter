# An Expert Analysis of JavaScript Libraries for Code Call Graph Visualization in React

---

## Executive Summary and Recommendation Overview

The objective of this report is to provide an exhaustive technical analysis of JavaScript libraries suitable for visualizing code call graphs within a React application, based on a detailed set of requirements. The analysis confirms that the user's project goals are fully achievable with high-quality, permissively licensed open-source libraries. After a thorough evaluation, two premier contenders emerge: **React Flow** and **AntV G6**.

A critical finding of this analysis is the clarification of React Flow's licensing model. Contrary to the initial assessment, the core React Flow library is distributed under the permissive MIT License, making it a fully viable and cost-free option that meets the open-source requirement. The commercial "Pro" offering is an optional subscription for advanced examples and support, which funds the development of the free core library. This correction is fundamental, as it positions React Flow as a primary candidate that directly addresses the limitations identified with other libraries.

The central challenge highlighted in the initial query—the difficulty of creating rich, interactive HTML-based custom nodes in libraries like Cytoscape—is a solved problem in both React Flow and AntV G6. Both provide robust, native-like support for rendering custom React components as nodes, which is essential for the project's requirements of including clickable links to files and line numbers.

The final recommendation hinges on a strategic trade-off between developer experience and the breadth of built-in functionality. The choice between the two leading libraries will depend on specific project priorities and team preferences:

- **React Flow** is the recommended choice for teams prioritizing a "React-native" developer experience. Its architecture is deeply integrated with React's core concepts, offering unparalleled flexibility and a more intuitive development process for those already proficient in the React ecosystem.
- **AntV G6** is the recommended choice for teams seeking a powerful, "all-in-one" solution. It boasts an extensive suite of built-in layout algorithms and components, minimizing the need for external dependencies and offering potentially superior performance for extremely large-scale graphs out-of-the-box.

This report will proceed by first validating and clarifying the initial landscape of options. It will then present a detailed, head-to-head comparative analysis of React Flow and AntV G6 against each specified requirement. Following this, it will explore advanced implementation patterns for complex interactivity and performance. The report will conclude with a strategic recommendation framework to guide the final selection process.

---

## Re-evaluating the Landscape: Addressing Initial Findings

A crucial first step in any technical evaluation is to build upon existing research. The preliminary analysis provided in the query demonstrates a solid understanding of the graph visualization landscape, with several accurate assessments that warrant confirmation. However, it also contains a critical misconception regarding licensing that fundamentally alters the available options.

### Confirmation of Preliminary Research

The initial investigation correctly identified the limitations of several popular libraries for this specific use case. The assessment of graphviz-d3 as cumbersome due to the steep learning curve of D3.js is a widely shared experience; D3 provides immense power but at the cost of significant development effort, as it operates by directly manipulating the DOM based on data. Likewise, the evaluation of Excalidraw and Tldraw as excellent for interactivity but unsuitable for this project due to their lack of automatic layout engines is accurate. Their primary function is as whiteboarding tools, not programmatic graph visualizers.

The experience with Cytoscape.js also aligns with common feedback. While Cytoscape is an exceptionally powerful and mature library for graph theory analysis and visualization, particularly in bioinformatics and social network analysis, its rendering approach can make the integration of rich, interactive HTML content within nodes more complex than in other modern libraries. This confirms that the user's primary pain point is valid and is a key differentiator to consider.

### Critical Clarification: The React Flow Licensing Model

The most significant finding of this analysis is the correction of React Flow's classification as a "paid for" library. This appears to be a misunderstanding of its business model, which has significant implications for its suitability.

> **Note:** The core library, `@xyflow/react` (formerly `react-flow-renderer`), is, and has consistently been, published under the permissive MIT License. This license permits free use in personal and commercial projects, with the only major condition being the preservation of copyright and license notices. This directly satisfies the primary technical requirement for a permissive open-source license.

The "paid" component is React Flow Pro, a subscription service offered by the creators, xyflow. This service provides subscribers with access to a repository of pre-built, production-ready examples for advanced use cases (such as Auto Layout, Collaborative Flows, and Undo/Redo), professional templates, and prioritized technical support via GitHub and direct contact. The revenue from these subscriptions is explicitly used to fund the ongoing development and maintenance of the open-source core library, ensuring its longevity and continued improvement.

It is essential to understand that none of the core features required for this project—custom nodes, layout engine integration, serialization, interactivity—are locked behind the Pro subscription. All are fully available within the free, MIT-licensed version. The Pro examples serve as accelerators and provide patterns for complex implementations, but the underlying capabilities are open to all users.

This clarification is pivotal. The initial evaluation likely dismissed React Flow prematurely based on a perceived cost barrier. In reality, it is a top-tier, open-source candidate that is architecturally designed to solve the exact problems encountered with other libraries, particularly the seamless integration of interactive React components as nodes. With this understanding, React Flow moves from being disqualified to being a central focus of our comparative analysis.

---

## Premier Contenders: A Head-to-Head Analysis of React Flow and AntV G6

With the landscape clarified, the analysis now centers on the two most promising libraries that meet all stated requirements: **React Flow** and **AntV G6**. Both are powerful, well-maintained, and offer a path to success. The decision between them lies in their architectural philosophies, developer experience, and the trade-offs between built-in features and modular flexibility.

### Feature Comparison Matrix

| Feature             | Requirement Details     | React Flow                                              | AntV G6                                                        |
| ------------------- | ----------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| **License**         | Permissive open source  | MIT                                                     | MIT                                                            |
| **Framework**       | TypeScript/React        | Native React                                            | JS/TS with React Extension                                     |
| **Layout Engine**   | Auto-layout included    | External Integration (ELK.js, Dagre, d3-hierarchy)      | Extensive Built-in Suite (Force, Dagre, Circular, etc.)        |
| **Custom Nodes**    | Interactive HTML/React  | Yes (Native React Components)                           | Yes (React Components via Extension)                           |
| **Clickable Links** | Nodes link to file/line | Yes (via standard `<a>` tags in custom nodes)           | Yes (via standard `<a>` tags in custom nodes)                  |
| **Interactivity**   | Mouse-based editing     | Yes (Draggable, Selectable, Connectable by default)     | Yes (Configurable behaviors like drag-element)                 |
| **Serialization**   | To JSON with positions  | Yes (`toObject` method captures nodes, edges, viewport) | Yes (Data is inherently JSON, positions are part of node data) |
| **Zoom**            | Zoom triggers/controls  | Yes (Built-in controls, zoom on scroll/double-click)    | Yes (Configurable zoom-canvas behavior)                        |
| **Zoom Visibility** | Show/hide on zoom       | Yes (Via `useStore` hook to access zoom level)          | Yes (Via event listeners and `hideItem`/`showItem` methods)    |

---

## In-Depth Capability Assessment

### Architectural Philosophy and React Integration

The most fundamental difference between React Flow and AntV G6 lies in their core architecture and relationship with React.

- **React Flow** is architected as a "React-native" library. It is not merely a JavaScript library wrapped for React; its entire paradigm is built around React's concepts. Developers interact with it using familiar patterns like hooks (`useNodesState`, `useEdgesState`, `useReactFlow`) and components (`<ReactFlow />`, `<MiniMap />`, `<Controls />`). State management is designed to plug directly into React's own state mechanisms (`useState`, `useReducer`) or popular state management libraries like Zustand or Redux. The graph itself is treated as a declarative React component, where the rendered output is a function of its props (`nodes`, `edges`). This approach creates a seamless and highly intuitive developer experience for those already proficient in React.

- **AntV G6**, by contrast, is a powerful, framework-agnostic visualization engine. Its core is built upon a dedicated graphics rendering layer (`@antv/g`), which provides the foundation for its extensive features across multiple rendering technologies (Canvas, SVG, WebGL). The primary way to interact with G6 is imperatively, by creating a `new Graph({...})` instance and calling methods on it. The React integration is provided through an official extension, `@antv/g6-extension-react`. This extension acts as a bridge, allowing developers to render React components inside nodes.

This architectural distinction leads to different development workflows. With React Flow, building a graph feels like building any other part of a React application. With G6, it feels more like configuring and controlling a powerful, external visualization tool from within a React application. For a project deeply embedded in the React ecosystem, React Flow's approach may feel more natural and maintainable.

### Implementing Custom Interactive Nodes

This is the user's most critical requirement, and both libraries offer excellent solutions that are superior to what was experienced with Cytoscape.

#### React Flow Example

In React Flow, creating a custom node is as simple as creating a standard React component. This component is then passed to the ReactFlow component via the `nodeTypes` prop. The custom node component automatically receives props such as `id`, `data` (for custom payloads), and `selected` (for styling).

To implement a clickable link to a file and line number, one would simply include a standard HTML `<a>` tag within the JSX of the custom node component. A protocol like `vscode://file/` can be used to create direct links that open files in a code editor.

```jsx
// components/CodeCallNode.jsx
import React from "react";
import { Handle, Position } from "@xyflow/react";

// This node receives functionName, filePath, and lineNumber in its `data` prop.
function CodeCallNode({ data }) {
  // Construct a link that opens the file in VS Code at the specific line.
  const fileLink = `vscode://file/${data.filePath}:${data.lineNumber}`;

  return (
    <div
      style={{
        padding: "10px",
        border: "1px solid #1a192b",
        borderRadius: "3px",
        background: "#f0f0f0",
      }}
    >
      {/* Handles are the connection points for edges */}
      <Handle type="target" position={Position.Top} />
      <div>
        <strong>Function:</strong> {data.functionName}
      </div>
      <a
        href={fileLink}
        onClick={(event) => event.stopPropagation()} // Prevents node drag from triggering on link click
        title={`Open ${data.filePath} at line ${data.lineNumber}`}
      >
        Open in Editor
      </a>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default CodeCallNode;
```

#### AntV G6 Example

In AntV G6, the process involves a few more steps but achieves the same result. First, the generic `ReactNode` type from the `@antv/g6-extension-react` package must be registered with a unique name. Then, a standard React component is created to define the node's content. Finally, within the graph's configuration, the node's type is set to the registered name, and the `style.component` property is used to render the React component, passing it the node's data.

```jsx
import { Graph, ExtensionCategory, register } from "@antv/g6";
import { ReactNode } from "@antv/g6-extension-react";
import ReactDOM from "react-dom";

// 1. Register the custom React node type with G6
register(ExtensionCategory.NODE, "code-call-react-node", ReactNode);

// 2. Define the React component for the node
const CodeCallComponent = ({ data }) => {
  const fileLink = `vscode://file/${data.filePath}:${data.lineNumber}`;
  return (
    <div
      style={{
        padding: "10px 15px",
        border: "1px solid #5B8FF9",
        borderRadius: "5px",
        background: "#C6E5FF",
      }}
    >
      <div>
        <strong>Function:</strong> {data.functionName}
      </div>
      <a
        href={fileLink}
        title={`Open ${data.filePath} at line ${data.lineNumber}`}
      >
        Open in Editor
      </a>
    </div>
  );
};

// 3. Use the custom node in the graph configuration
const graph = new Graph({
  container: "mountNode",
  //... other graph settings
  node: {
    type: "code-call-react-node",
    style: {
      // The `component` property renders the React component
      component: (node) => <CodeCallComponent data={node.data} />,
    },
  },
});
```

Both libraries successfully fulfill the requirement. React Flow's approach is slightly more direct, with less boilerplate, reinforcing its "React-native" feel. G6's approach is more explicit, reflecting its nature as a core engine with extensions.

### Automatic Layout: Built-in vs. External

A robust automatic layout engine is essential for visualizing complex call graphs without manual positioning. Here, the two libraries present a clear philosophical divergence.

- **AntV G6** champions a "batteries-included" approach. It comes with a comprehensive suite of over 10 built-in layout algorithms, including Dagre (ideal for hierarchical graphs like call graphs), Force (for organic network structures), Circular, Radial, Grid, and various specialized tree layouts. This is a major strength, as it provides a wealth of options without requiring any additional dependencies. Furthermore, G6 offers high-performance versions of some layouts that leverage WebAssembly (WASM) and GPU acceleration, which can be critical for very large graphs.

- **React Flow** adopts a modular philosophy. It does not include its own layout algorithms. Instead, it is designed to integrate seamlessly with best-in-class, dedicated layout libraries. The official documentation and Pro examples showcase integrations with:
  - **ELK.js (elkjs):** An excellent choice for complex, layered, and hierarchical layouts, often used for diagrams like UML or call graphs.
  - **Dagre (@dagrejs/dagre):** A popular and effective library specifically for directed, hierarchical graphs.
  - **d3-hierarchy:** Part of the D3 ecosystem, perfect for tree-like structures.

While this approach requires adding and managing external dependencies, it offers the flexibility to choose the absolute best and most configurable tool for a specific layout problem. Open-source examples and sandboxes demonstrate how to implement these integrations, even without a Pro subscription. The general pattern involves running the external layout engine on the nodes and edges to calculate their positions, and then updating the React Flow state with the new coordinates.

For a code call graph, a hierarchical layout is the most appropriate. Both G6's built-in Dagre layout and React Flow's integration with external Dagre or ELK.js will produce the desired result. The decision comes down to a preference for the convenience of G6's all-in-one package versus the modular flexibility of React Flow.

### State Management and Serialization

The ability to save the state of the graph, including user-modified node positions, and restore it later is a key requirement.

- **React Flow** provides a clean and comprehensive solution with the `toObject()` method, which can be called on the React Flow instance obtained via the `useReactFlow` hook. This method returns a single JSON object containing three key properties: `nodes`, `edges`, and `viewport`. The `nodes` array includes each node's current position (x and y coordinates), data payload, and other properties. The `viewport` object captures the current pan and zoom state (x, y, zoom). This complete snapshot can be easily stringified and saved. Restoration is equally straightforward: parse the JSON and use the data to initialize the `nodes`, `edges`, and `defaultViewport` props of the `<ReactFlow />` component. This aligns perfectly with standard React state management patterns.

- **AntV G6** handles serialization through its fundamental data structure. The graph's data is inherently a JSON object containing `nodes` and `edges` arrays. After a layout algorithm runs or a user manually drags a node, the `x` and `y` properties of the node objects in the graph's internal data model are updated. Therefore, to save the state, one can call `graph.save()` (in older versions) or simply retrieve the current data from the instance using a method like `graph.findData('node')` and serialize it. The result is a JSON object that includes the final positions of all nodes. While G6 also has methods to export to image formats or other graph-specific formats like GEXF, simple JSON serialization of the data object is the most direct way to meet this requirement.

Both libraries fully support serialization to JSON. React Flow's `toObject()` method offers a slight convenience by packaging the viewport state along with the node and edge data in a single function call.

### Advanced Functionality and Implementation Patterns

Beyond the core requirements, a robust solution must handle more nuanced, real-world challenges like dynamic visibility, performance at scale, and long-term maintainability.

#### Implementing Zoom-Dependent Visibility

For large call graphs, it's often desirable to hide details at low zoom levels and reveal them as the user zooms in. This is a form of Level of Detail (LOD) rendering.

- **React Flow:**

  This is achieved elegantly and declaratively using the `useStore` hook. This hook allows a component to subscribe to any part of the internal React Flow state, including the viewport's transformation matrix, which contains the current zoom level. Inside a custom node component, one can access this live zoom value and use standard React conditional rendering to show different content.

  ```jsx
  // Inside a custom node component
  import { useStore } from "@xyflow/react";

  // A selector to get the zoom level from the store
  const selectZoom = (state) => state.transform;

  function MyZoomableNode({ data }) {
    const zoomLevel = useStore(selectZoom);

    return (
      <div>
        {/* Always show the function name */}
        <strong>{data.functionName}</strong>
        {/* Only show details when zoomed in sufficiently */}
        {zoomLevel > 1.5 ? (
          <div className="node-details">
            <p>File: {data.filePath}</p>
            <p>Complexity: {data.complexity}</p>
          </div>
        ) : (
          <div className="node-summary">[Zoom in for details]</div>
        )}
      </div>
    );
  }
  ```

  This pattern is highly idiomatic to React. The component automatically re-renders when the zoom level changes, with no manual event listeners or DOM manipulation required.

- **AntV G6:**

  The approach is more imperative and event-driven. A developer would listen for a canvas event, such as `canvas:wheel` or a dedicated zoom event if available. The event handler would then get the current zoom level from the graph instance via `graph.getZoom()`. Based on this value, the developer would need to iterate through the relevant nodes and edges and call `graph.showItem(id)` or `graph.hideItem(id)` to toggle their visibility. While this is effective and provides fine-grained control, it involves more manual state management compared to React Flow's declarative, hook-based approach. The G6 documentation suggests this pattern for performance optimization on large graphs.

### Performance at Scale

Visualizing a large code call graph can involve thousands of nodes and edges, making performance a critical consideration.

- **React Flow** includes performance optimizations such as viewport culling, where it only renders elements currently visible in the viewport (`onlyRenderVisibleElements` prop). The library's "Stress Test" example demonstrates its capability to render hundreds of nodes and edges smoothly. For most common use cases, its performance is more than adequate. For extremely large graphs, performance will be influenced by the efficiency of the chosen external layout engine and the general overhead of React's rendering lifecycle.

- **AntV G6** positions high performance as one of its key strengths. Its documentation and examples showcase its ability to handle graphs with tens of thousands of elements. This is achieved through several mechanisms:
  - **Optimized Rendering Engine:** The underlying `@antv/g` engine is purpose-built for high-performance graphics.
  - **Multiple Renderers:** The ability to switch between Canvas, SVG, and WebGL renderers allows developers to choose the best technology for their performance needs.
  - **WASM and GPU Layouts:** For computationally intensive layout calculations on massive graphs, G6 offers WASM and GPU-accelerated versions of its algorithms, which can provide a significant performance boost over pure JavaScript implementations.

For call graphs of moderate size (up to a few thousand nodes), both libraries are likely to perform well. For exceptionally large or dense graphs, G6's dedicated performance architecture and accelerated layouts may provide a tangible advantage with less custom optimization effort.

### Ecosystem and Maintainability

The long-term viability of a chosen library depends on its maintenance, community, and ecosystem.

- **React Flow** is developed and maintained by xyflow, a dedicated company. This commercial backing provides a strong incentive for the continued improvement and support of the open-source core. The library has a vibrant and growing community, with a showcase featuring thousands of users, including prominent technology companies like Stripe and Typeform. This indicates widespread adoption and a healthy ecosystem, ensuring that documentation, examples, and community support are readily available.

- **AntV G6** is a flagship product of the AntV data visualization suite, developed by Ant Group, a major technology corporation. This provides a very high level of stability and guarantees long-term support and development. G6 is part of a broader ecosystem of AntV tools, including Graphin (a React toolkit for graph analysis) and Ant Design Charts. This provides a rich, integrated environment for developers who adopt the AntV stack.

Both libraries are excellent choices from a maintainability perspective. They are backed by stable entities and have active communities. The decision is not about risk but about which ecosystem better aligns with the project's technology stack and development philosophy.

---

## Strategic Recommendation and Conclusion

The analysis demonstrates that both React Flow and AntV G6 are highly capable, open-source libraries that can successfully meet all technical and interactive requirements for the code call graph visualization project. The final choice is not about which library is "better" in an absolute sense, but which is a better strategic fit for the development team and project goals.

### Summary of Strengths

**React Flow:**

- Unparalleled Developer Experience: Its "React-native" architecture provides an intuitive and idiomatic workflow for React developers.
- Maximum Customization Flexibility: Custom nodes are standard React components, allowing for limitless complexity and interactivity using familiar patterns.
- Modular and Flexible: Its philosophy of integrating with best-in-class external libraries for tasks like layout provides flexibility and avoids feature bloat.

**AntV G6:**

- "Batteries-Included" Powerhouse: It offers a vast suite of built-in features, components, and plugins, minimizing the need for external dependencies.
- Superior Built-in Layouts: The sheer number and variety of its layout algorithms, including high-performance WASM and GPU options, are a significant out-of-the-box advantage.
- Optimized for Scale: Its dedicated rendering engine and performance-focused features make it a strong contender for visualizing extremely large datasets.

### The Recommendation Framework

The decision can be guided by answering a few key questions about project priorities:

**Choose React Flow if:**

- The development team is deeply experienced with React and values a development process that feels native to the framework's ecosystem.
- The primary and most critical requirement is the creation of deeply customized, highly interactive nodes that must seamlessly integrate with the rest of the React application's state and logic.
- The team prefers a modular architecture, is comfortable managing a few extra dependencies (e.g., for a layout engine), and values the ability to select specialized tools for specific problems.

**Choose AntV G6 if:**

- The priority is an all-in-one, comprehensive solution that minimizes external dependencies and provides a wide array of functionalities out-of-the-box.
- The project anticipates the need for diverse or extremely high-performance layout algorithms without the overhead of integrating and configuring third-party libraries.
- The team is comfortable with a more traditional library interaction model (instantiating and configuring a graph object) and may need to support non-React environments in the future.

---

## Final Guidance for This Project

For the specific use case of a code call graph visualization, a hierarchical layout (like Dagre or ELK) is paramount, and both libraries provide excellent support for this. The most significant differentiator, therefore, becomes the developer experience, particularly concerning the user's primary pain point: custom node creation.

Given the explicit preference for a React-based solution and the difficulties previously encountered with creating rich, interactive nodes, **React Flow** emerges as the most direct and satisfying solution. Its approach to custom nodes as simple React components removes the friction entirely. The ability to simply embed an `<a>` tag with a `vscode://` link inside a familiar JSX structure is the most seamless path to achieving the project's core interactive goal.

It is recommended to begin prototyping with the free, MIT-licensed version of React Flow. Armed with the correct understanding of its licensing model, developers can leverage its full power to build the required visualization, confident that it is a cost-effective, powerful, and highly suitable choice for this project.

---

## Works Cited

1. MIT license - latitude-dev/react-flow - GitHub, accessed on July 15, 2025, https://github.com/latitude-dev/react-flow/blob/main/LICENSE
2. reactflow - NPM, accessed on July 15, 2025, https://www.npmjs.com/package/reactflow
3. React Flow Pro Pricing, accessed on July 15, 2025, https://reactflow.dev/pro/pricing
4. D3 by Observable | The JavaScript library for bespoke data visualization, accessed on July 15, 2025, https://d3js.org/
5. Building Interactive Data Visualizations with D3.js and React - SitePoint, accessed on July 15, 2025, https://www.sitepoint.com/d3-js-react-interactive-data-visualizations/
6. A Comprehensive Guide to Using D3.js in React - InfluxData, accessed on July 15, 2025, https://www.influxdata.com/blog/guide-d3js-react/
7. chart.js vs d3 vs cytoscape vs vis-network vs react-vis vs sigma - NPM Compare, accessed on July 15, 2025, https://npm-compare.com/chart.js,d3,cytoscape,vis-network,sigma,react-vis
8. JavaScript graph visualization with paths - Stack Overflow, accessed on July 15, 2025, https://stackoverflow.com/questions/26388836/javascript-graph-visualization-with-paths
9. Ogma vs Cytoscape.js: which graph visualization library for your application?, accessed on July 15, 2025, https://doc.linkurious.com/ogma/latest/compare/cytoscape.html
10. React Flow Pro, accessed on July 15, 2025, https://pro.reactflow.dev/
11. Request a Quote - React Flow, accessed on July 15, 2025, https://reactflow.dev/pro/quote-request
12. React Flow Pro Examples, accessed on July 15, 2025, https://reactflow.dev/pro/examples
13. antv/g6-pc - NPM, accessed on July 15, 2025, https://www.npmjs.com/package/@antv/g6-pc
14. @antv/g6 - npm, accessed on July 15, 2025, https://www.npmjs.com/package/@antv/g6
15. Building Advanced Node-Based Interfaces with ReactFlow — A Deep Dive into VisualFlow.dev's Premium Examples - Azim Uddin Ahamed, accessed on July 15, 2025, https://azimuahamed.medium.com/building-advanced-node-based-interfaces-with-reactflow-a-deep-dive-into-visualflow-devs-ff3812c71535
16. xyflow: Node-Based UIs for React and Svelte, accessed on July 15, 2025, https://xyflow.com/
17. AntV - G6 Graph Visualization Framework in JavaScript, accessed on July 15, 2025, https://g6.antv.antgroup.com/en/
18. Define Nodes with React | G6 Graph Visualization Framework in JavaScript, accessed on July 15, 2025, https://g6.antv.vision/en/manual/element/node/react-node/
19. Auto Layout - React Flow, accessed on July 15, 2025, https://reactflow.dev/examples/layout/auto-layout
20. Introduction | G6 Graph Visualization Framework in JavaScript, accessed on July 15, 2025, https://g6.antv.vision/en/manual/introduction/
21. Layout Overview | G6 Graph Visualization Framework in JavaScript, accessed on July 15, 2025, https://g6.antv.antgroup.com/en/manual/layout/overview
22. Custom Nodes - React Flow, accessed on July 15, 2025, https://reactflow.dev/examples/nodes/custom-node
23. Node Overview | G6 Graph Visualization Framework in JavaScript, accessed on July 15, 2025, https://g6.antv.antgroup.com/en/manual/element/node/overview
24. GitHub - Sebb77/react-flow: React library for building interactive node-based graphs, accessed on July 15, 2025, https://github.com/Sebb77/react-flow
25. Adding Interactivity - React Flow, accessed on July 15, 2025, https://reactflow.dev/learn/concepts/adding-interactivity
26. Element Operations | G6 Graph Visualization Framework in JavaScript, accessed on July 15, 2025, https://g6.antv.vision/en/api/element/
27. Behavior Overview | G6 Graph Visualization Framework in JavaScript, accessed on July 15, 2025, https://g6.antv.antgroup.com/en/manual/behavior/overview
28. Save and Restore - React Flow, accessed on July 15, 2025, https://reactflow.dev/examples/interaction/save-and-restore
29. tutorial/intermediate/serialization/to-json-diff - X6, accessed on July 15, 2025, https://x6.antv.vision/demos/tutorial/intermediate/serialization/to-json-diff/
30. Step-by-step guide | G6 Graph Visualization Framework in JavaScript, accessed on July 15, 2025, https://g6.antv.antgroup.com/en/manual/getting-started/step-by-step
31. The Controls component - React Flow, accessed on July 15, 2025, https://reactflow.dev/api-reference/components/controls
32. Contextual Zoom - React Flow, accessed on July 15, 2025, https://reactflow.dev/examples/interaction/contextual-zoom
33. Problems in AntV G6: Performance Tips | by Yanyan Wang - Medium, accessed on July 15, 2025, https://yanyanwang93.medium.com/problems-in-antv-g6-performance-tips-3b9a60f34abb
34. Feature Overview - React Flow, accessed on July 15, 2025, https://reactflow.dev/examples/overview
35. Using a State Management Library - React Flow, accessed on July 15, 2025, https://reactflow.dev/learn/advanced-use/state-management
36. Feature | G6 Graph Visualization Framework in JavaScript, accessed on July 15, 2025, https://g6.antv.antgroup.com/en/manual/whats-new/feature
37. antvis/G6: A Graph Visualization Framework in JavaScript. - GitHub, accessed on July 15, 2025, https://github.com/antvis/G6
38. Dynamic Layouting - React Flow, accessed on July 15, 2025, https://reactflow.dev/examples/layout/dynamic-layouting
39. React Flow Examples - Medium, accessed on July 15, 2025, https://medium.com/react-digital-garden/react-flow-examples-2cbb0bab4404
40. react-flow elk auto layout - CodeSandbox, accessed on July 15, 2025, https://codesandbox.io/s/react-flow-elk-auto-layout-8sqdtu
41. G6 v4.x renderer='svg' exported svg contains hided nodes and edges · Issue #6505 - GitHub, accessed on July 15, 2025, https://github.com/antvis/G6/issues/6505
42. Event Listening | G6 Graph Visualization Framework in JavaScript, accessed on July 15, 2025, https://g6.antv.antgroup.com/en/api/event
43. The ReactFlow component - React Flow, accessed on July 15, 2025, https://reactflow.dev/api-reference/react-flow
44. Examples - React Flow, accessed on July 15, 2025, https://reactflow.dev/examples
45. Gallery | G6 Graph Visualization Framework in JavaScript, accessed on July 15, 2025, https://g6.antv.antgroup.com/en/examples
46. Showcase - React Flow, accessed on July 15, 2025, https://reactflow.dev/showcase
