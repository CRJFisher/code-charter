import type { CallGraph, CallGraphNode } from "@ariadnejs/types";

/**
 * Docstring-driven descriptions for a code tree.
 * Uses docstrings extracted from source code as the primary description source,
 * falling back to name + signature for undocumented symbols.
 */
export interface DocstringSummaries {
  /** symbol -> docstring body (or name+signature fallback for undocumented symbols) */
  docstrings: Record<string, string>;
  /** All nodes in the call tree */
  call_tree: Record<string, CallGraphNode>;
}

/**
 * Represents a group of related nodes/symbols
 */
export interface NodeGroup {
  description: string;
  memberSymbols: string[];
}

/**
 * Connection status for the backend
 */
export enum ConnectionStatus {
  CONNECTING = "connecting",
  CONNECTED = "connected",
  DISCONNECTED = "disconnected",
  ERROR = "error"
}

/**
 * Backend connection state
 */
export interface BackendState {
  status: ConnectionStatus;
  error?: string;
}

/**
 * Main interface for Code Charter backend implementations
 */
export interface CodeCharterBackend {
  /**
   * Get the current connection state
   */
  getState(): BackendState;

  /**
   * Initialize the backend connection
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the backend
   */
  disconnect(): Promise<void>;

  /**
   * Get the call graph for the current project
   */
  getCallGraph(): Promise<CallGraph | undefined>;

  /**
   * Cluster code tree nodes into logical groups
   */
  clusterCodeTree(topLevelFunctionSymbol: string): Promise<NodeGroup[]>;

  /**
   * Get descriptions for a code tree starting from a given function (docstring extraction, no LLM)
   */
  get_code_tree_descriptions(topLevelFunctionSymbol: string): Promise<DocstringSummaries | undefined>;

  /**
   * Navigate to a specific document location
   */
  navigateToDoc(relativeDocPath: string, lineNumber: number): Promise<void>;

  /**
   * Subscribe to backend state changes
   */
  onStateChange(callback: (state: BackendState) => void): () => void;
}