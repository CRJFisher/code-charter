import {
  CodeCharterBackend,
  NodeGroup,
  TreeAndContextSummaries,
  CallGraph,
  CallableNode,
} from "@code-charter/types";
import type { SymbolId, SymbolName, FilePath, ScopeId, AnyDefinition, CallReference } from "@ariadnejs/types";

function make_symbol_id(file: string, start_line: number, end_line: number, name: string): SymbolId {
  return `function:${file}:${start_line}:0:${end_line}:0:${name}` as SymbolId;
}

function make_call_ref(target_id: SymbolId, name: string, caller_file: string, line: number): CallReference {
  return {
    location: { file_path: caller_file as FilePath, start_line: line, start_column: 0, end_line: line, end_column: 20 },
    name: name as SymbolName,
    scope_id: `function:${caller_file}:0:0:100:0` as ScopeId,
    call_type: "function" as const,
    resolutions: [{ symbol_id: target_id, confidence: "certain" as const, reason: { type: "direct" as const } }],
  };
}

function make_node(file: string, start_line: number, end_line: number, name: string, calls: CallReference[] = []): CallableNode {
  const id = make_symbol_id(file, start_line, end_line, name);
  return {
    symbol_id: id,
    name: name as SymbolName,
    enclosed_calls: calls,
    location: { file_path: file as FilePath, start_line, start_column: 0, end_line, end_column: 0 },
    definition: {
      kind: "function",
      symbol_id: id,
      name: name as SymbolName,
      defining_scope_id: `global:${file}:0:0:100:0` as ScopeId,
      location: { file_path: file as FilePath, start_line, start_column: 0, end_line, end_column: 0 },
      is_exported: false,
      signature: { parameters: [] },
      body_scope_id: `function:${file}:${start_line}:0:${end_line}:0` as ScopeId,
    } as AnyDefinition,
    is_test: false,
  };
}

/**
 * Mock backend implementation for testing and demos
 */
export class MockBackend implements CodeCharterBackend {
  async getCallGraph(): Promise<CallGraph | undefined> {
    const process_data_id = make_symbol_id("utils.ts", 9, 19, "processData");
    const fetch_data_id = make_symbol_id("api.ts", 4, 14, "fetchData");

    const main_node = make_node("main.ts", 0, 9, "main", [
      make_call_ref(process_data_id, "processData", "main.ts", 4),
      make_call_ref(fetch_data_id, "fetchData", "main.ts", 5),
    ]);
    const process_data_node = make_node("utils.ts", 9, 19, "processData", [
      make_call_ref(fetch_data_id, "fetchData", "utils.ts", 14),
    ]);
    const fetch_data_node = make_node("api.ts", 4, 14, "fetchData");

    const nodes = new Map<SymbolId, CallableNode>();
    nodes.set(main_node.symbol_id, main_node);
    nodes.set(process_data_node.symbol_id, process_data_node);
    nodes.set(fetch_data_node.symbol_id, fetch_data_node);

    return {
      nodes,
      entry_points: [main_node.symbol_id],
    };
  }

  async clusterCodeTree(topLevelFunctionSymbol: string): Promise<NodeGroup[]> {
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
    const mock_node = make_node("main.ts", 0, 10, topLevelFunctionSymbol.split(':').pop() || topLevelFunctionSymbol);

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
        [topLevelFunctionSymbol]: mock_node
      },
      contextSummary: "This codebase implements a data processing application that fetches data from external APIs, processes it through a validation pipeline, and produces structured output."
    };
  }

  async navigateToDoc(relativeDocPath: string, lineNumber: number): Promise<void> {
    console.log(`Mock navigation to ${relativeDocPath}:${lineNumber}`);
  }
}
