/**
 * Represents a summary of a code tree with function-level details
 * Note: CallGraphNode is from @ariadnejs/core
 */
export interface TreeAndContextSummaries {
  functionSummaries: Record<string, string>;
  refinedFunctionSummaries: Record<string, string>;
  callTreeWithFilteredOutNodes: Record<string, any>; // CallGraphNode from ariadnejs/core
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
  getCallGraph(): Promise<any | undefined>; // CallGraph from @ariadnejs/core

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

  /**
   * Subscribe to backend state changes
   */
  onStateChange(callback: (state: BackendState) => void): () => void;
}