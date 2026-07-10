/**
 * Hand-built `CallGraph` + fake `AriadneAdapter` for the fast in-memory reconcile unit tests
 * (`agentic_modes.test.ts`, `affected_flows.test.ts`). No `HeadlessProject`, no Ariadne parse, no
 * built bin — every node, call site, and anchored symbol is specified literally, so a test can pin the
 * exact shape the code under test branches on (an unresolved call at a chosen `file:line`, a seed
 * absent from the graph, a member whose body drifted).
 *
 * Ids are derived, not invented: a node's `symbol_id` is its flow-layer `symbol_path`
 * (`<file>#<name>:<kind>`), the same key `flow_id_of`/`build_symbol_path_index` derive, so a spec's
 * `id_of` is exactly what the code under test resolves seeds and descriptions against.
 */

import type { CallGraph, CallableNode, CallReference, FilePath, SymbolId, SymbolName } from "@ariadnejs/types";
import type { ScopeId } from "@ariadnejs/types/dist/scopes";
import type { AnyDefinition, FunctionDefinition } from "@ariadnejs/types/dist/symbol_definitions";
import type { Resolution } from "@ariadnejs/types/dist/symbol_references";
import type { AnchoredSymbol, GraphStore, ResolverIndex } from "@code-charter/core";
import { build_resolver_index, build_symbol_path } from "@code-charter/core";

import type { AriadneAdapter } from "../ariadne_adapter";
import type { ReconcileDeps } from "../types";

/** One call site inside a node. Omit `to` (or leave it empty) for an unresolved call (a comprehension gap). */
export interface CallSpec {
  /** Target flow-layer symbol_paths this call resolves to, each with `certain` confidence. */
  to?: string[];
  /** Call-site file (defaults to the enclosing node's file). */
  file?: string;
  /** Call-site 1-indexed start line (defaults to 1). */
  line?: number;
  start_column?: number;
  end_line?: number;
  end_column?: number;
  /** Display name; defaults to the first target's, else `call`. */
  name?: string;
  /** Ariadne's synthetic-callback flag — excluded from the unresolved-call predicate. */
  is_callback?: boolean;
}

export interface NodeSpec {
  file: string;
  name: string;
  /** Definition kind woven into the symbol_path (`:function`). Defaults to `function`. */
  kind?: string;
  /** 1-indexed defining line. Defaults to 1. */
  line?: number;
  is_test?: boolean;
  calls?: CallSpec[];
}

/** The flow-layer symbol_path (== the node's `symbol_id`) for a spec — what seeds/descriptions resolve against. */
export function id_of(spec: { file: string; name: string; kind?: string }): string {
  return build_symbol_path(spec.file, [], spec.name, spec.kind ?? "function");
}

function resolution_of(target: string): Resolution {
  return { symbol_id: target as SymbolId, confidence: "certain", reason: { type: "direct" } };
}

function call_reference(node_file: string, call: CallSpec): CallReference {
  const file = call.file ?? node_file;
  const start_line = call.line ?? 1;
  const reference: CallReference = {
    location: {
      file_path: file as FilePath,
      start_line,
      start_column: call.start_column ?? 0,
      end_line: call.end_line ?? start_line,
      end_column: call.end_column ?? 1,
    },
    name: (call.name ?? call.to?.[0] ?? "call") as SymbolName,
    scope_id: "scope:0" as ScopeId,
    call_type: "function",
    resolutions: (call.to ?? []).map(resolution_of),
  };
  return call.is_callback ? { ...reference, is_callback_invocation: true } : reference;
}

export function make_node(spec: NodeSpec): CallableNode {
  const id = id_of(spec);
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
    symbol_id: id as SymbolId,
    name: spec.name as SymbolName,
    defining_scope_id: "scope:0" as ScopeId,
    location,
    is_exported: true,
    signature: { parameters: [] },
    body_scope_id: "scope:1" as ScopeId,
  };
  return {
    symbol_id: id as SymbolId,
    name: spec.name as SymbolName,
    enclosed_calls: (spec.calls ?? []).map((call) => call_reference(spec.file, call)),
    location,
    definition,
    is_test: spec.is_test ?? false,
  };
}

/** Assemble a `CallGraph` from node specs; `entry_points` are the specs promoted as roots. */
export function make_graph(specs: NodeSpec[], entry_points: NodeSpec[]): CallGraph {
  const nodes = new Map<SymbolId, CallableNode>();
  for (const spec of specs) {
    const node = make_node(spec);
    nodes.set(node.symbol_id, node);
  }
  return { nodes, entry_points: entry_points.map((s) => id_of(s) as SymbolId) };
}

/** An {@link AnchoredSymbol} for the describe / apply-descriptions join. `symbol_path` defaults to `id_of`. */
export function anchored_of(spec: {
  file: string;
  name: string;
  kind?: string;
  content_hash?: string;
  symbol_path?: string;
}): AnchoredSymbol {
  const symbol_path = spec.symbol_path ?? id_of(spec);
  const content_hash = spec.content_hash ?? "h0";
  return {
    symbol_id: id_of(spec) as SymbolId,
    symbol_path,
    content_hash,
    anchor: `${symbol_path}:${content_hash}`,
    file_path: spec.file,
    definition: make_node(spec).definition as AnyDefinition,
  };
}

/** A fake adapter serving the hand-built graph, chosen source lines, and pre-built anchored symbols. */
export function make_adapter(
  graph: CallGraph,
  opts: { sources?: Record<string, string>; anchored?: AnchoredSymbol[] } = {},
): AriadneAdapter {
  const anchored = opts.anchored ?? [];
  return {
    call_graph: () => graph,
    extract_raw: () => {},
    build_index: (): ResolverIndex => build_resolver_index([]),
    anchored_symbols: (files) => anchored.filter((a) => files.includes(a.file_path)),
    file_of: (symbol_id) => graph.nodes.get(symbol_id)?.location.file_path,
    omitted_files: () => new Set(),
    source_line: (file, line) => {
      const text = opts.sources?.[file]?.split(/\r?\n/)[line - 1];
      return text === undefined ? undefined : text.trim();
    },
  };
}

/** Assemble `ReconcileDeps` over an in-memory store and the fake adapter, with a deterministic clock. */
export function make_deps(
  store: GraphStore,
  adapter: AriadneAdapter,
  log: (message: string) => void = () => {},
): ReconcileDeps {
  let tick = 0;
  return {
    store,
    adapter,
    repo_root_abs: "/repo",
    analyzed_root: "",
    now: () => new Date(2026, 0, 1, 0, 0, tick++).toISOString(),
    log,
  };
}
