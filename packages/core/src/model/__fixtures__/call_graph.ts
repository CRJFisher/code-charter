/**
 * Minimal in-memory `CallGraph` builder for flow tests. Mirrors the shape Ariadne emits (see the
 * webview's mock backend) with only the fields the flow model reads.
 */

import type { CallGraph, CallableNode, CallReference, SymbolId, SymbolName } from "@ariadnejs/types";
import type { ScopeId } from "@ariadnejs/types/dist/scopes";
import type { FunctionDefinition } from "@ariadnejs/types/dist/symbol_definitions";
import type { FilePath } from "@ariadnejs/types";
import type { Resolution } from "@ariadnejs/types/dist/symbol_references";

export interface NodeSpec {
  id: string;
  name: string;
  file: string;
  line?: number;
  /** Target ids this node calls (each resolved with `certain` confidence). */
  calls?: string[];
  /** Marks the node as a test (gap-detection excludes tests by default). */
  is_test?: boolean;
  /** Call sites with an empty `resolutions` array — unresolved (gap-detection AC#1). */
  unresolved_calls?: string[];
  /** Call sites with more than one resolution — polymorphic/dynamic dispatch. */
  dynamic_calls?: Array<{ name: string; targets: string[] }>;
  /** Call sites flagged `is_callback_invocation` (excluded from the unresolved ratio). */
  callback_calls?: string[];
}

function resolution_of(target_id: string): Resolution {
  return { symbol_id: target_id as SymbolId, confidence: "certain", reason: { type: "direct" } };
}

function base_reference(name: string, resolutions: Resolution[]): CallReference {
  return {
    location: { file_path: "" as FilePath, start_line: 1, start_column: 0, end_line: 1, end_column: 1 },
    name: name as SymbolName,
    scope_id: "scope:0" as ScopeId,
    call_type: "function",
    resolutions,
  };
}

function call_reference(target_id: string, name: string): CallReference {
  return base_reference(name, [resolution_of(target_id)]);
}

function enclosed_calls_of(spec: NodeSpec): CallReference[] {
  const calls: CallReference[] = [];
  for (const target of spec.calls ?? []) calls.push(call_reference(target, target));
  for (const name of spec.unresolved_calls ?? []) calls.push(base_reference(name, []));
  for (const dynamic of spec.dynamic_calls ?? []) {
    calls.push(base_reference(dynamic.name, dynamic.targets.map(resolution_of)));
  }
  for (const target of spec.callback_calls ?? []) {
    calls.push({ ...call_reference(target, target), is_callback_invocation: true });
  }
  return calls;
}

export function make_node(spec: NodeSpec): CallableNode {
  const line = spec.line ?? 1;
  const location = {
    file_path: spec.file as FilePath,
    start_line: line,
    start_column: 0,
    end_line: line + 1,
    end_column: 0,
  };
  const definition: FunctionDefinition = {
    kind: "function",
    symbol_id: spec.id as SymbolId,
    name: spec.name as SymbolName,
    defining_scope_id: "scope:0" as ScopeId,
    location,
    is_exported: false,
    signature: { parameters: [] },
    body_scope_id: "scope:1" as ScopeId,
  };
  return {
    symbol_id: spec.id as SymbolId,
    name: spec.name as SymbolName,
    enclosed_calls: enclosed_calls_of(spec),
    location,
    definition,
    is_test: spec.is_test ?? false,
  };
}

export function make_graph(specs: NodeSpec[], entry_points: string[]): CallGraph {
  const nodes = new Map<SymbolId, CallableNode>();
  for (const spec of specs) {
    const node = make_node(spec);
    nodes.set(node.symbol_id, node);
  }
  return { nodes, entry_points: entry_points as SymbolId[] };
}
