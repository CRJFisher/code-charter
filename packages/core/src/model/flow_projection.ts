/**
 * task-27.1.3 AC#3/#6 — project a flow into adapter-ready render rows.
 *
 * `project_flow` is the deterministic render path: it re-induces the flow's reachable subgraph from the
 * in-memory `CallGraph` (no SQLite, no agent), synthesizes one `code.function` `NodeRow` per member and
 * one `code.calls` `EdgeRow` per resolved in-flow call, folds in the file-module scaffold (the leaves'
 * first parent), and bounds the result to a per-view node+edge budget. The output is exactly the
 * `RenderedRows` shape the webview's `custom_graph_to_react_flow` adapter consumes.
 *
 * The projected `code.function` rows are render-only: their `id` is the Ariadne `symbol_id` (unique and
 * deterministic within a graph), `path` is the defining file, and `anchor` is null (no body hashing
 * happens here — the rows are never persisted). The adapter reads `attributes.label` for the display
 * name, so the id format is irrelevant to rendering. A persisted, hydrated flow (task-27.1.6) is layered
 * over this same seam later.
 *
 * Budget (AC#6, minimal): under budget, leaves render nested in their file-module groups (the adapter
 * turns `agentic.contains` into `parentId`). Over budget, the flow collapses to module granularity —
 * leaves drop and `code.calls` edges lift to module-to-module edges — preserving whole-flow coverage at
 * lower resolution rather than truncating. Deeper level-projection is deferred (D-LARGE-FLOW-RENDER).
 */

import type { CallGraph, SymbolId } from "@ariadnejs/types";
import type { EdgeRow, NodeRow, RenderedRows } from "@code-charter/types";

import { build_module_scaffold, path_module_resolver } from "./module_scaffold";
import { induce_members, type SkeletonFlow } from "./flow";

/** A per-view ceiling on rendered elements (AC#6). */
export interface FlowBudget {
  max_nodes: number;
  max_edges: number;
}

/** The default per-view budget. Pinned, deterministic; deeper handling is D-LARGE-FLOW-RENDER (open). */
export const DEFAULT_FLOW_BUDGET: FlowBudget = { max_nodes: 200, max_edges: 400 };

export interface ProjectFlowOptions {
  /** Repo-relative prefix; leaves outside it bucket under `<external>` in the scaffold (AC#9). */
  analyzed_root?: string;
  budget?: FlowBudget;
}

const CODE_FUNCTION_KIND = "code.function";
const CODE_CALLS_KIND = "code.calls";
const PROJECTION_ORIGIN = "call-graph-projection";

/** Provenance confidence per resolution certainty — drives the dashed-edge render for weaker links. */
const CONFIDENCE_BY_CERTAINTY: Record<string, number> = { certain: 1, probable: 0.6, possible: 0.3 };

/** Project `flow`'s reachable subgraph into bounded, scaffold-folded render rows (AC#3, AC#6). */
export function project_flow(flow: SkeletonFlow, graph: CallGraph, options: ProjectFlowOptions = {}): RenderedRows {
  const analyzed_root = options.analyzed_root ?? "";
  const budget = options.budget ?? DEFAULT_FLOW_BUDGET;

  const members = induce_members({ id: flow.id, seeds: flow.seeds }, graph);
  const member_ids = [...members].sort();

  const function_rows: NodeRow[] = [];
  for (const id of member_ids) {
    const node = graph.nodes.get(id);
    if (!node) continue;
    function_rows.push(function_row(id, node.location.file_path, node.name, node.location.start_line));
  }

  const call_edges = build_call_edges(member_ids, members, graph);
  const scaffold = build_module_scaffold(function_rows, path_module_resolver(analyzed_root));

  const within_budget =
    function_rows.length + scaffold.module_nodes.length <= budget.max_nodes &&
    call_edges.length + scaffold.contains_edges.length <= budget.max_edges;

  if (within_budget) {
    return {
      nodes: [...function_rows, ...scaffold.module_nodes],
      edges: [...call_edges, ...scaffold.contains_edges],
    };
  }

  // Over budget: collapse to module granularity. Keep the file-module group nodes, drop the leaves, and
  // lift each in-flow call to a module-to-module edge (dropping intra-module and duplicate edges). This
  // bounds a large flow to one node per defining file; a flow spanning more distinct files than the
  // budget (e.g. a whole-library unattributed bucket) still exceeds it — multi-level directory rollup
  // for that case is D-LARGE-FLOW-RENDER (open), deferred to task-27.1.12.
  const module_of = new Map<string, string>(); // leaf id -> module id
  for (const edge of scaffold.contains_edges) module_of.set(edge.src_id, edge.dst_id);
  const lifted = lift_edges_to_modules(call_edges, module_of);
  return { nodes: scaffold.module_nodes, edges: lifted };
}

/** A render-only `code.function` row: id = Ariadne symbol_id, file in `path`, no anchor (never hashed). */
function function_row(id: string, file_path: string, name: string, line_number: number): NodeRow {
  return {
    id,
    kind: CODE_FUNCTION_KIND,
    path: file_path,
    anchor: null,
    layer: "raw",
    attributes: { label: name, line_number },
    field_ownership: {},
    origin: PROJECTION_ORIGIN,
    intent_source: "code-edit",
    deleted_at: null,
  };
}

/** One `code.calls` edge per resolved call whose target is in the member set; deduped, deterministic. */
function build_call_edges(member_ids: readonly string[], members: ReadonlySet<SymbolId>, graph: CallGraph): EdgeRow[] {
  const by_key = new Map<string, EdgeRow>();
  for (const src of member_ids) {
    const node = graph.nodes.get(src as SymbolId);
    if (!node) continue;
    for (const call of node.enclosed_calls) {
      for (const resolution of call.resolutions) {
        const dst = resolution.symbol_id;
        if (!members.has(dst)) continue;
        const key = `${CODE_CALLS_KIND}:${src}->${dst}`;
        if (by_key.has(key)) continue;
        by_key.set(key, {
          key,
          src_id: src,
          dst_id: dst,
          kind: CODE_CALLS_KIND,
          confidence: CONFIDENCE_BY_CERTAINTY[resolution.confidence] ?? 1,
          layer: "raw",
          attributes: {},
          field_ownership: {},
          origin: PROJECTION_ORIGIN,
          intent_source: "code-edit",
          adjudication: null,
          deleted_at: null,
        });
      }
    }
  }
  return [...by_key.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Lift leaf-to-leaf `code.calls` to module-to-module edges, dropping self-loops and duplicates. */
function lift_edges_to_modules(edges: readonly EdgeRow[], module_of: ReadonlyMap<string, string>): EdgeRow[] {
  const by_key = new Map<string, EdgeRow>();
  for (const edge of edges) {
    const src_module = module_of.get(edge.src_id);
    const dst_module = module_of.get(edge.dst_id);
    if (src_module === undefined || dst_module === undefined || src_module === dst_module) continue;
    const key = `${CODE_CALLS_KIND}:${src_module}->${dst_module}`;
    if (by_key.has(key)) continue;
    by_key.set(key, {
      key,
      src_id: src_module,
      dst_id: dst_module,
      kind: CODE_CALLS_KIND,
      confidence: 1,
      layer: "raw",
      attributes: {},
      field_ownership: {},
      origin: PROJECTION_ORIGIN,
      intent_source: "code-edit",
      adjudication: null,
      deleted_at: null,
    });
  }
  return [...by_key.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
