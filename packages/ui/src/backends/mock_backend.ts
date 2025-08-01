import { CallGraph } from "@ariadnejs/core";
import {
  CodeCharterBackend,
  BackendState,
  ConnectionStatus,
  NodeGroup,
  TreeAndContextSummaries
} from "./types";

/**
 * Mock backend implementation for testing and demos
 */
export class MockBackend implements CodeCharterBackend {
  private state: BackendState = { status: ConnectionStatus.DISCONNECTED };
  private stateListeners: Set<(state: BackendState) => void> = new Set();

  getState(): BackendState {
    return this.state;
  }

  async connect(): Promise<void> {
    this.updateState({ status: ConnectionStatus.CONNECTING });
    
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    this.updateState({ status: ConnectionStatus.CONNECTED });
  }

  async disconnect(): Promise<void> {
    this.updateState({ status: ConnectionStatus.DISCONNECTED });
  }

  async getCallGraph(): Promise<any | undefined> {
    // Return a sample call graph with correct types
    const nodes = new Map();
    
    // Create nodes with the correct structure
    const mainNode = {
      definition: {
        symbol: "main.ts:main",
        name: "main",
        file_path: "main.ts",
        range: { start: { row: 0, column: 0 }, end: { row: 9, column: 0 } }
      },
      references: [],
      called_by: []
    };
    
    const processDataNode = {
      definition: {
        symbol: "utils.ts:processData",
        name: "processData",
        file_path: "utils.ts",
        range: { start: { row: 9, column: 0 }, end: { row: 19, column: 0 } }
      },
      references: [
        {
          symbol: "main.ts:main",
          location: { path: "main.ts", range: { start: { row: 4, column: 0 }, end: { row: 4, column: 20 } } }
        }
      ],
      called_by: ["main.ts:main"]
    };
    
    const fetchDataNode = {
      definition: {
        symbol: "api.ts:fetchData",
        name: "fetchData",
        file_path: "api.ts",
        range: { start: { row: 4, column: 0 }, end: { row: 14, column: 0 } }
      },
      references: [
        {
          symbol: "main.ts:main",
          location: { path: "main.ts", range: { start: { row: 5, column: 0 }, end: { row: 5, column: 15 } } }
        },
        {
          symbol: "utils.ts:processData",
          location: { path: "utils.ts", range: { start: { row: 14, column: 0 }, end: { row: 14, column: 15 } } }
        }
      ],
      called_by: ["main.ts:main", "utils.ts:processData"]
    };

    nodes.set("main.ts:main", mainNode);
    nodes.set("utils.ts:processData", processDataNode);
    nodes.set("api.ts:fetchData", fetchDataNode);

    const mockGraph: CallGraph = {
      nodes,
      edges: [
        { 
          from: "main.ts:main", 
          to: "utils.ts:processData",
          location: { start: { row: 4, column: 0 }, end: { row: 4, column: 20 } }
        },
        { 
          from: "main.ts:main", 
          to: "api.ts:fetchData",
          location: { start: { row: 5, column: 0 }, end: { row: 5, column: 15 } }
        },
        { 
          from: "utils.ts:processData", 
          to: "api.ts:fetchData",
          location: { start: { row: 14, column: 0 }, end: { row: 14, column: 15 } }
        }
      ],
      top_level_nodes: ["main.ts:main"]
    };

    return mockGraph;
  }

  async clusterCodeTree(topLevelFunctionSymbol: string): Promise<NodeGroup[]> {
    // Return sample clusters
    return [
      {
        description: "Data Processing Functions",
        memberSymbols: ["utils.ts:processData", "utils.ts:transformData", "utils.ts:validateData"]
      },
      {
        description: "API Integration Layer",
        memberSymbols: ["api.ts:fetchData", "api.ts:postData", "api.ts:handleError"]
      },
      {
        description: "Main Application Logic",
        memberSymbols: ["main.ts:main", "main.ts:initialize", "main.ts:cleanup"]
      }
    ];
  }

  async summariseCodeTree(topLevelFunctionSymbol: string): Promise<TreeAndContextSummaries | undefined> {
    // Return sample summaries
    // Create a mock node that matches the CallGraphNode structure
    const mockNode: any = {
      symbol: topLevelFunctionSymbol,
      calls: [],
      location: { path: "main.ts", line: 1 },
      file_path: "main.ts"
    };

    return {
      functionSummaries: {
        [topLevelFunctionSymbol]: "Main entry point that orchestrates data processing and API calls",
        "utils.ts:processData": "Processes raw data into structured format",
        "api.ts:fetchData": "Fetches data from external API endpoints"
      },
      refinedFunctionSummaries: {
        [topLevelFunctionSymbol]: "Application entry point - initializes services, processes data, and manages API interactions",
        "utils.ts:processData": "Data processing pipeline with validation and transformation steps",
        "api.ts:fetchData": "HTTP client for external API with retry logic and error handling"
      },
      callTreeWithFilteredOutNodes: {
        [topLevelFunctionSymbol]: mockNode
      },
      contextSummary: "This codebase implements a data processing application that fetches data from external APIs, processes it through a validation pipeline, and produces structured output."
    };
  }

  async navigateToDoc(relativeDocPath: string, lineNumber: number): Promise<void> {
    // In mock mode, just log the navigation request
    console.log(`Mock navigation to ${relativeDocPath}:${lineNumber}`);
  }

  onStateChange(callback: (state: BackendState) => void): () => void {
    this.stateListeners.add(callback);
    return () => {
      this.stateListeners.delete(callback);
    };
  }

  private updateState(state: BackendState): void {
    this.state = state;
    this.stateListeners.forEach(listener => listener(state));
  }
}