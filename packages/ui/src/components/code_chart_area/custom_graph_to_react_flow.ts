/**
 * Adapt a flow's rendered rows (plain `NodeRow`/`EdgeRow`, the `render_flow` backend result) into React
 * Flow nodes and edges. This is the webview's leaf-rendering path: `code_chart_area` calls it with the
 * rows `render_flow(flow_id)` returns, then runs `apply_hierarchical_layout` over the result.
 *
 * The React Flow node `type` is resolved from `NodeRow.kind` through the open registry
 * (`resolve_node_type`), never a hardcoded `code_function`/`module_group` branch — so a shaped flowchart
 * node (task-27.1.11) or a doc node (task-21.2) becomes a `register_node_kind` entry, not an adapter
 * edit. `attributes.description` maps to the node label. The file-module tier (AC#9) is rendered by
 * turning each `agentic.contains` edge (leaf → module) into the leaf's `parentId`; those edges are not
 * drawn. Soft-deleted rows are already excluded by `render()` (unless `show_tombstones`), so the adapter
 * neither re-filters nor mutates — it renders exactly the rows it is given. The full `NodeRow`/`EdgeRow`
 * is carried on `data.row` so selection-driven provenance (AC#8) can read it without a second lookup.
 */

import type { EdgeRow, NodeRow } from "@code-charter/types";

import type { CodeNodeData } from "./code_function_node";
import { resolve_node_type, type ModuleNodeData } from "./chart_node_types";
import type { CodeChartEdge, CodeChartNode } from "./chart_types";
import { error_logger } from "./error_handling";

const CONTAINS_EDGE_KIND = "agentic.contains";

export interface RenderedRows {
  nodes: NodeRow[];
  edges: EdgeRow[];
}

export interface ReactFlowElements {
  nodes: CodeChartNode[];
  edges: CodeChartEdge[];
}

export function custom_graph_to_react_flow(rows: RenderedRows): ReactFlowElements {
  const parent_of = new Map<string, string>();
  const member_count = new Map<string, number>();
  for (const edge of rows.edges) {
    if (edge.kind !== CONTAINS_EDGE_KIND) continue;
    parent_of.set(edge.src_id, edge.dst_id); // leaf -> module (AC#9 direction)
    member_count.set(edge.dst_id, (member_count.get(edge.dst_id) ?? 0) + 1);
  }

  // A node is emitted only if its kind has a registered component; a parentId is set only if the
  // parent module was also emitted, so a leaf never references a React Flow parent that doesn't exist.
  const emitted = new Set(rows.nodes.filter((row) => resolve_node_type(row.kind) !== undefined).map((row) => row.id));
  const nodes: CodeChartNode[] = [];
  for (const row of rows.nodes) {
    const type = resolve_node_type(row.kind);
    if (type === undefined) {
      error_logger.log(new Error(`No React Flow node component registered for kind '${row.kind}'`), "warning", {
        node_id: row.id,
      });
      continue;
    }
    const parent_id = parent_of.get(row.id);
    nodes.push(build_node(row, type, parent_id !== undefined && emitted.has(parent_id) ? parent_id : undefined, member_count.get(row.id) ?? 0));
  }

  const edges: CodeChartEdge[] = [];
  for (const edge of rows.edges) {
    if (edge.kind === CONTAINS_EDGE_KIND) continue; // structural containment is expressed via parentId
    if (!emitted.has(edge.src_id) || !emitted.has(edge.dst_id)) continue; // drop dangling edges
    edges.push({ id: edge.key, source: edge.src_id, target: edge.dst_id, data: { row: edge } });
  }

  return { nodes, edges };
}

function build_node(row: NodeRow, type: string, parent_id: string | undefined, member_count: number): CodeChartNode {
  const description = string_attr(row.attributes.description) ?? "";
  if (type === "module_group") {
    const data: ModuleNodeData = {
      module_name: string_attr(row.attributes.label) ?? display_name_of(row),
      description,
      member_count,
      cluster_index: 0,
      row,
    };
    return { id: row.id, type, position: { x: 0, y: 0 }, data };
  }

  const data: CodeNodeData = {
    function_name: string_attr(row.attributes.label) ?? display_name_of(row),
    description,
    file_path: row.path,
    line_number: number_attr(row.attributes.line_number) ?? 1,
    symbol: row.id,
    row,
  };
  const node: CodeChartNode = { id: row.id, type, position: { x: 0, y: 0 }, data };
  if (parent_id !== undefined) {
    node.parentId = parent_id;
    node.extent = "parent";
  }
  return node;
}

/** A readable name for a row: the symbol name after the anchor's `#`, before its `:kind` suffix. */
function display_name_of(row: NodeRow): string {
  const hash = row.id.indexOf("#");
  const tail = hash === -1 ? row.id : row.id.slice(hash + 1);
  const colon = tail.lastIndexOf(":");
  return colon === -1 ? tail : tail.slice(0, colon);
}

function string_attr(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function number_attr(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
