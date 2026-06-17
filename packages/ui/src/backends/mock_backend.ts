import {
  CodeCharterBackend,
  FlowSummary,
  RenderedRows,
  CallGraph,
  CallableNode,
  CallReference,
  SymbolId,
  SymbolName,
  NodeRow,
  EdgeRow,
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

/** A render-only code.function row (no anchor; the adapter reads `attributes.label`). */
function code_function_row(id: string, label: string, file_path: string, line_number: number, is_entry_point?: boolean): NodeRow {
  return {
    id,
    kind: "code.function",
    path: file_path,
    anchor: null,
    layer: "raw",
    attributes: is_entry_point === true ? { label, line_number, is_entry_point: true } : { label, line_number },
    field_ownership: {},
    origin: "mock",
    intent_source: "code-edit",
    deleted_at: null,
  };
}

function module_group_row(file_path: string): NodeRow {
  return {
    id: `agentic.group:file:${file_path}`,
    kind: "agentic.group",
    path: file_path,
    anchor: null,
    layer: "agentic",
    attributes: { label: file_path, group_kind: "file-module" },
    field_ownership: {},
    origin: "mock",
    intent_source: "code-edit",
    deleted_at: null,
  };
}

function contains_edge(leaf_id: string, file_path: string): EdgeRow {
  const group_id = `agentic.group:file:${file_path}`;
  return {
    key: `agentic.contains:${leaf_id}->${group_id}`,
    src_id: leaf_id,
    dst_id: group_id,
    kind: "agentic.contains",
    confidence: 1,
    layer: "agentic",
    attributes: {},
    field_ownership: {},
    origin: "mock",
    intent_source: "code-edit",
    adjudication: null,
    deleted_at: null,
  };
}

function calls_edge(src_id: string, dst_id: string): EdgeRow {
  return {
    key: `code.calls:${src_id}->${dst_id}`,
    src_id,
    dst_id,
    kind: "code.calls",
    confidence: 1,
    layer: "raw",
    attributes: {},
    field_ownership: {},
    origin: "mock",
    intent_source: "code-edit",
    adjudication: null,
    deleted_at: null,
  };
}

/**
 * Mock backend implementation for testing and demos. Returns a single deterministic skeleton flow
 * (`main` reaching `processData` + `fetch_data`) whose `render_flow` rows exercise the full adapter
 * path: `code.function` leaves, file-module `agentic.group` parents (via `agentic.contains`), and
 * `code.calls` edges.
 */
export class MockBackend implements CodeCharterBackend {
  async get_call_graph(): Promise<CallGraph | undefined> {
    const main_node = make_mock_callable_node("main.ts:main", "main", "main.ts", 0, 9, [
      make_call_reference("utils.ts:processData", "processData", 4),
      make_call_reference("api.ts:fetch_data", "fetch_data", 5),
    ]);
    const process_data_node = make_mock_callable_node("utils.ts:processData", "processData", "utils.ts", 9, 19, [
      make_call_reference("api.ts:fetch_data", "fetch_data", 14),
    ]);
    const fetch_data_node = make_mock_callable_node("api.ts:fetch_data", "fetch_data", "api.ts", 4, 14);

    const nodes = new Map<SymbolId, CallableNode>();
    nodes.set(main_node.symbol_id, main_node);
    nodes.set(process_data_node.symbol_id, process_data_node);
    nodes.set(fetch_data_node.symbol_id, fetch_data_node);

    return {
      nodes,
      entry_points: ["main.ts:main" as SymbolId],
    };
  }

  async list_flows(): Promise<FlowSummary[]> {
    return [
      {
        id: "main.ts#main:function",
        label: "main",
        is_hydrated: false,
        last_synced_at: null,
        member_count: 3,
        is_unattributed: false,
        seed_location: { file_path: "main.ts", line_number: 0 },
      },
    ];
  }

  // The single-flow demo double returns one fixed graph regardless of flow_id; the real extension keys
  // the projection on flow_id. The over-budget collapse and unattributed-bucket paths are covered by
  // core's flow_projection unit tests, not exercised here.
  async render_flow(_flow_id: string): Promise<RenderedRows> {
    return {
      nodes: [
        code_function_row("main.ts:main", "main", "main.ts", 0, true),
        code_function_row("utils.ts:processData", "processData", "utils.ts", 9),
        code_function_row("api.ts:fetch_data", "fetch_data", "api.ts", 4),
        module_group_row("main.ts"),
        module_group_row("utils.ts"),
        module_group_row("api.ts"),
      ],
      edges: [
        contains_edge("main.ts:main", "main.ts"),
        contains_edge("utils.ts:processData", "utils.ts"),
        contains_edge("api.ts:fetch_data", "api.ts"),
        calls_edge("main.ts:main", "utils.ts:processData"),
        calls_edge("main.ts:main", "api.ts:fetch_data"),
        calls_edge("utils.ts:processData", "api.ts:fetch_data"),
      ],
    };
  }

  async navigate_to_doc(file_path: string, line_number: number): Promise<void> {
    console.log(`Mock navigation to ${file_path}:${line_number}`);
  }
}
