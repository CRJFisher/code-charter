import { Node, Edge } from "@xyflow/react";
import { CodeNodeData } from "./code_function_node";
import { ModuleNodeData } from "./zoom_aware_node";

// Define the specific node types used in our React Flow implementation
export type CodeChartNode = Node<CodeNodeData | ModuleNodeData>;
export type CodeChartEdge = Edge;

// Type guard functions
export function isCodeNode(node: CodeChartNode): node is Node<CodeNodeData> {
  return node.type === "code_function";
}

export function isModuleNode(node: CodeChartNode): node is Node<ModuleNodeData> {
  return node.type === "module_group";
}

// Helper type for React Flow state
export interface ReactFlowState {
  nodes: CodeChartNode[];
  edges: CodeChartEdge[];
}