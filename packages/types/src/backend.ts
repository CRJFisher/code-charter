import type { CallGraph, CallableNode } from "@ariadnejs/types";
import type { ClusteringAlgorithm } from "./clustering";

/**
 * Docstring-driven descriptions for a code tree.
 * Uses docstrings extracted from source code as the primary description source,
 * falling back to name + signature for undocumented symbols.
 */
export interface DocstringSummaries {
  /** symbol -> docstring body (or name+signature fallback for undocumented symbols) */
  docstrings: Record<string, string>;
  /** All nodes in the call tree */
  call_tree: Record<string, CallableNode>;
}

/**
 * Represents a group of related nodes/symbols
 */
export interface NodeGroup {
  description: string;
  member_symbols: string[];
  metadata?: {
    algorithm_used: ClusteringAlgorithm;
    quality_score?: number;
    cluster_index: number;
  };
}

/**
 * Main interface for Code Charter backend implementations
 */
export interface CodeCharterBackend {
  /**
   * Get the call graph for the current project
   */
  get_call_graph(): Promise<CallGraph | undefined>;

  /**
   * Cluster code tree nodes into logical groups
   */
  cluster_code_tree(top_level_function_symbol: string): Promise<NodeGroup[]>;

  /**
   * Get descriptions for a code tree starting from a given function (docstring extraction, no LLM)
   */
  get_code_tree_descriptions(top_level_function_symbol: string): Promise<DocstringSummaries | undefined>;

  /**
   * Navigate to a specific document location
   */
  navigate_to_doc(file_path: string, line_number: number): Promise<void>;
}