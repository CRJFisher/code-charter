import { Node, Edge } from "@xyflow/react";
import type { EdgeRow } from "@code-charter/types";
import { CodeNodeData } from "./code_function_node";
import { ModuleNodeData } from "./chart_node_types";

// Discriminated node types for proper generic parameterization
export type CodeFunctionNodeType = Node<CodeNodeData, 'code_function'>;
export type ModuleGroupNodeType = Node<ModuleNodeData, 'module_group'>;

/** Edge data carrying the source row, attached by `custom_graph_to_react_flow` for provenance (AC#8). */
export interface CodeEdgeData extends Record<string, unknown> {
  row?: EdgeRow;
}

// Define the specific node types used in our React Flow implementation
export type CodeChartNode = Node<CodeNodeData | ModuleNodeData>;
export type CodeChartEdge = Edge<CodeEdgeData>;

// Type guard functions
export function is_code_node(node: CodeChartNode): node is CodeFunctionNodeType {
  return node.type === "code_function";
}

export function is_module_node(node: CodeChartNode): node is ModuleGroupNodeType {
  return node.type === "module_group";
}