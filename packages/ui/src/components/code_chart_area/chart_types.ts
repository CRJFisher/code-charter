import { Node, Edge } from "@xyflow/react";
import { CodeNodeData } from "./code_function_node";
import { ModuleNodeData } from "./chart_node_types";

// Discriminated node types for proper generic parameterization
export type CodeFunctionNodeType = Node<CodeNodeData, 'code_function'>;
export type ModuleGroupNodeType = Node<ModuleNodeData, 'module_group'>;

// Define the specific node types used in our React Flow implementation
export type CodeChartNode = Node<CodeNodeData | ModuleNodeData>;
export type CodeChartEdge = Edge;

// Type guard functions
export function isCodeNode(node: CodeChartNode): node is CodeFunctionNodeType {
  return node.type === "code_function";
}

export function isModuleNode(node: CodeChartNode): node is ModuleGroupNodeType {
  return node.type === "module_group";
}