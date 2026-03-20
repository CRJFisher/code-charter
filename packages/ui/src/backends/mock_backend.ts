import {
  CodeCharterBackend,
  NodeGroup,
  DocstringSummaries,
  CallGraph,
  CallableNode,
  CallReference,
  SymbolId,
  SymbolName,
  AnyDefinition,
} from "@code-charter/types";

function make_mock_callable_node(
  symbol_id: string,
  name: string,
  file_path: string,
  start_line: number,
  end_line: number
): CallableNode {
  const location = {
    file_path,
    start_line,
    start_column: 0,
    end_line,
    end_column: 0,
  };
  return {
    symbol_id: symbol_id as SymbolId,
    name: name as SymbolName,
    enclosed_calls: [],
    location,
    definition: {
      kind: "function" as const,
      symbol_id: symbol_id as SymbolId,
      name: name as SymbolName,
      defining_scope_id: "scope:0",
      location,
      is_exported: false,
      signature: { parameters: [] },
      body_scope_id: "scope:1",
    } as unknown as AnyDefinition,
    is_test: false,
  } as unknown as CallableNode;
}

function make_call_reference(
  target_symbol_id: string,
  name: string,
  line: number
): CallReference {
  return {
    location: {
      file_path: "",
      start_line: line,
      start_column: 0,
      end_line: line,
      end_column: 20,
    },
    name: name as SymbolName,
    scope_id: "scope:0",
    call_type: "function",
    resolutions: [{ symbol_id: target_symbol_id as SymbolId }],
  } as unknown as CallReference;
}

/**
 * Mock backend implementation for testing and demos
 */
export class MockBackend implements CodeCharterBackend {
  async getCallGraph(): Promise<CallGraph | undefined> {
    const main_node = make_mock_callable_node("main.ts:main", "main", "main.ts", 0, 9);
    const process_data_node = make_mock_callable_node("utils.ts:processData", "processData", "utils.ts", 9, 19);
    const fetch_data_node = make_mock_callable_node("api.ts:fetchData", "fetchData", "api.ts", 4, 14);

    (main_node as any).enclosed_calls = [
      make_call_reference("utils.ts:processData", "processData", 4),
      make_call_reference("api.ts:fetchData", "fetchData", 5),
    ];
    (process_data_node as any).enclosed_calls = [
      make_call_reference("api.ts:fetchData", "fetchData", 14),
    ];

    const nodes = new Map<SymbolId, CallableNode>();
    nodes.set(main_node.symbol_id, main_node);
    nodes.set(process_data_node.symbol_id, process_data_node);
    nodes.set(fetch_data_node.symbol_id, fetch_data_node);

    return {
      nodes,
      entry_points: ["main.ts:main" as SymbolId],
    } as CallGraph;
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

  async get_code_tree_descriptions(topLevelFunctionSymbol: string): Promise<DocstringSummaries | undefined> {
    const name = topLevelFunctionSymbol.split(':').pop() || topLevelFunctionSymbol;
    const mock_node = make_mock_callable_node(topLevelFunctionSymbol, name, "main.ts", 0, 10);

    return {
      docstrings: {
        [topLevelFunctionSymbol]: "Main entry point that orchestrates data processing and API calls",
        "utils.ts:processData": "Processes raw data into structured format",
        "api.ts:fetchData": "Fetches data from external API endpoints"
      },
      call_tree: {
        [topLevelFunctionSymbol]: mock_node
      }
    };
  }

  async navigateToDoc(relativeDocPath: string, lineNumber: number): Promise<void> {
    console.log(`Mock navigation to ${relativeDocPath}:${lineNumber}`);
  }
}
