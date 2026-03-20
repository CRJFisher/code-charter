import type { CallGraph, CallableNode } from "@ariadnejs/types";

/**
 * Represents a summary of a code tree with function-level details
 */
export interface TreeAndContextSummaries {
  functionSummaries: Record<string, string>;
  refinedFunctionSummaries: Record<string, string>;
  callTreeWithFilteredOutNodes: Record<string, CallableNode>;
  contextSummary: string;
}

/**
 * Represents a group of related nodes/symbols
 */
export interface NodeGroup {
  description: string;
  memberSymbols: string[];
}

/**
 * Main interface for Code Charter backend implementations
 */
export interface CodeCharterBackend {
  /**
   * Get the call graph for the current project
   */
  getCallGraph(): Promise<CallGraph | undefined>;

  /**
   * Cluster code tree nodes into logical groups
   */
  clusterCodeTree(topLevelFunctionSymbol: string): Promise<NodeGroup[]>;

  /**
   * Summarize a code tree starting from a given function
   */
  summariseCodeTree(topLevelFunctionSymbol: string): Promise<TreeAndContextSummaries | undefined>;

  /**
   * Navigate to a specific document location
   */
  navigateToDoc(relativeDocPath: string, lineNumber: number): Promise<void>;
}