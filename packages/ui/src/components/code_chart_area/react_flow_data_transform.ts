import { Node, Edge } from "@xyflow/react";
import { CallGraphNode } from "@ariadnejs/core";
import { TreeAndContextSummaries, NodeGroup } from "@code-charter/types";
import { symbolDisplayName } from "./symbol_utils";
import { CodeNodeData } from "./code_function_node";
import { ModuleNodeData } from "./zoom_aware_node";
import { calculateNodeDimensions } from "./elk_layout";

export interface ReactFlowElements {
  nodes: Node[];
  edges: Edge[];
}

export function generateReactFlowElements(
  selectedEntryPoint: CallGraphNode,
  summariesAndFilteredCallTree: TreeAndContextSummaries,
  nodeGroups: NodeGroup[] | undefined
): ReactFlowElements {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const visited = new Set<string>();
  
  // Define the mappings for module clustering
  const compoundIdToGroup: { [compoundId: string]: NodeGroup } = {};
  const symbolToCompoundId: { [symbol: string]: string } = {};
  
  // Process nodeGroups to populate the mappings
  (nodeGroups || []).forEach((group, index) => {
    const compoundId = `module_${index}`;
    compoundIdToGroup[compoundId] = group;
    for (const memberSymbol of group.memberSymbols) {
      symbolToCompoundId[memberSymbol] = compoundId;
    }
  });
  
  // Track module connections for compound edges
  const moduleConnections = new Map<string, Set<string>>();
  
  // Helper function to add a function node
  const addFunctionNode = (node: CallGraphNode, isTopLevel: boolean, position: { x: number; y: number }) => {
    if (visited.has(node.symbol)) {
      return;
    }
    visited.add(node.symbol);
    
    const summary = summariesAndFilteredCallTree.summaries?.[node.symbol]?.trimStart() || "";
    const parentModuleId = symbolToCompoundId[node.symbol];
    
    // Create the React Flow node
    const functionNode: Node<CodeNodeData> = {
      id: node.symbol,
      type: "code_function",
      position,
      data: {
        function_name: symbolDisplayName(node.symbol),
        summary,
        file_path: node.definition.file_path,
        line_number: node.definition.range.start.row,
        is_entry_point: isTopLevel,
        symbol: node.symbol,
      },
      parentNode: parentModuleId,
      extent: parentModuleId ? "parent" : undefined,
    };
    
    // Calculate dimensions
    const dimensions = calculateNodeDimensions(functionNode);
    functionNode.width = dimensions.width;
    functionNode.height = dimensions.height;
    
    nodes.push(functionNode);
    
    // Process child calls
    let childY = position.y + 150;
    node.calls.forEach((call, index) => {
      // Add edge
      const edgeId = `${node.symbol}-${call.symbol}`;
      edges.push({
        id: edgeId,
        source: node.symbol,
        target: call.symbol,
        type: "default",
        animated: false,
      });
      
      // Track module connections
      const childModuleId = symbolToCompoundId[call.symbol];
      if (parentModuleId && childModuleId && parentModuleId !== childModuleId) {
        if (!moduleConnections.has(parentModuleId)) {
          moduleConnections.set(parentModuleId, new Set());
        }
        moduleConnections.get(parentModuleId)!.add(childModuleId);
      }
      
      // Recursively add child nodes
      const childNode = summariesAndFilteredCallTree.callTreeWithFilteredOutNodes[call.symbol];
      if (childNode) {
        const childX = position.x + (index - node.calls.length / 2) * 250;
        addFunctionNode(childNode, false, { x: childX, y: childY });
      }
    });
  };
  
  // Add module group nodes if clustering is enabled
  if (nodeGroups && nodeGroups.length > 0) {
    nodeGroups.forEach((group, index) => {
      const moduleId = `module_${index}`;
      const moduleNode: Node<ModuleNodeData> = {
        id: moduleId,
        type: "module_group",
        position: { x: index * 400, y: 0 },
        data: {
          module_name: `Module ${index + 1}`,
          description: group.description || "",
          member_count: group.memberSymbols.length,
        },
        style: {
          width: 350,
          height: 300,
          backgroundColor: "rgba(240, 240, 240, 0.5)",
          borderRadius: "10px",
          padding: "20px",
        },
      };
      nodes.push(moduleNode);
    });
    
    // Add edges between modules
    moduleConnections.forEach((targets, source) => {
      targets.forEach(target => {
        const moduleEdgeId = `module-edge-${source}-${target}`;
        edges.push({
          id: moduleEdgeId,
          source,
          target,
          type: "default",
          animated: false,
          style: {
            stroke: "#cccccc",
            strokeWidth: 3,
          },
        });
      });
    });
  }
  
  // Start processing from the entry point
  const entryPointInTree = summariesAndFilteredCallTree.callTreeWithFilteredOutNodes[selectedEntryPoint.symbol];
  if (entryPointInTree) {
    addFunctionNode(entryPointInTree, true, { x: 0, y: 0 });
  }
  
  return { nodes, edges };
}