import {
  CodeCharterBackend,
  NodeGroup,
  DocstringSummaries,
  CallGraph,
  CallableNode,
  CallReference,
  SymbolId,
  SymbolName,
} from "@code-charter/types";
import type { FilePath } from "@ariadnejs/types";
import type { ScopeId } from "@ariadnejs/types/dist/scopes";
import type { FunctionDefinition } from "@ariadnejs/types/dist/symbol_definitions";
import type { Resolution } from "@ariadnejs/types/dist/symbol_references";

function make_mock_callable_node(
  symbol_id: string,
  name: string,
  file_path: string,
  start_line: number,
  end_line: number,
  enclosed_calls: readonly CallReference[] = []
): CallableNode {
  const location = {
    file_path: file_path as FilePath,
    start_line,
    start_column: 0,
    end_line,
    end_column: 0,
  };
  const definition: FunctionDefinition = {
    kind: "function",
    symbol_id: symbol_id as SymbolId,
    name: name as SymbolName,
    defining_scope_id: "scope:0" as ScopeId,
    location,
    is_exported: false,
    signature: { parameters: [] },
    body_scope_id: "scope:1" as ScopeId,
  };
  return {
    symbol_id: symbol_id as SymbolId,
    name: name as SymbolName,
    enclosed_calls,
    location,
    definition,
    is_test: false,
  };
}

function make_call_reference(
  target_symbol_id: string,
  name: string,
  line: number
): CallReference {
  const resolution: Resolution = {
    symbol_id: target_symbol_id as SymbolId,
    confidence: "certain",
    reason: { type: "direct" },
  };
  return {
    location: {
      file_path: "" as FilePath,
      start_line: line,
      start_column: 0,
      end_line: line,
      end_column: 20,
    },
    name: name as SymbolName,
    scope_id: "scope:0" as ScopeId,
    call_type: "function",
    resolutions: [resolution],
  };
}

/**
 * Mock backend implementation for testing and demos
 */
export class MockBackend implements CodeCharterBackend {
  async getCallGraph(): Promise<CallGraph | undefined> {
    const main_node = make_mock_callable_node("main.ts:main", "main", "main.ts", 0, 9, [
      make_call_reference("utils.ts:processData", "processData", 4),
      make_call_reference("api.ts:fetchData", "fetchData", 5),
    ]);
    const process_data_node = make_mock_callable_node("utils.ts:processData", "processData", "utils.ts", 9, 19, [
      make_call_reference("api.ts:fetchData", "fetchData", 14),
    ]);
    const fetch_data_node = make_mock_callable_node("api.ts:fetchData", "fetchData", "api.ts", 4, 14);

    const nodes = new Map<SymbolId, CallableNode>();
    nodes.set(main_node.symbol_id, main_node);
    nodes.set(process_data_node.symbol_id, process_data_node);
    nodes.set(fetch_data_node.symbol_id, fetch_data_node);

    return {
      nodes,
      entry_points: ["main.ts:main" as SymbolId],
    };
  }

  async clusterCodeTree(_top_level_function_symbol: string): Promise<NodeGroup[]> {
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

  async get_code_tree_descriptions(top_level_function_symbol: string): Promise<DocstringSummaries | undefined> {
    const name = top_level_function_symbol.split(':').pop() || top_level_function_symbol;
    const mock_node = make_mock_callable_node(top_level_function_symbol, name, "main.ts", 0, 10);

    return {
      docstrings: {
        [top_level_function_symbol]: "Main entry point that orchestrates data processing and API calls",
        "utils.ts:processData": "Processes raw data into structured format",
        "api.ts:fetchData": "Fetches data from external API endpoints"
      },
      call_tree: {
        [top_level_function_symbol]: mock_node
      }
    };
  }

  async navigateToDoc(file_path: string, line_number: number): Promise<void> {
    console.log(`Mock navigation to ${file_path}:${line_number}`);
  }
}
