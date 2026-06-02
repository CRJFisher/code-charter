/**
 * task-27.1.2 AC#9 — the file-module first-parent tier.
 *
 * Leaf code nodes are grouped under one `agentic.group` per defining file, derived deterministically
 * from each leaf's anchor (the `symbol_path` segment before `#`). Membership is persisted as
 * `agentic.contains` edges (leaf → module) with a path-based group id (no anchor-set hash, no
 * clustering). Files resolving outside the analyzed root collapse into a single `<external>` group.
 *
 * Everything here is pure and path-derived, so recomputing over the same leaf set always yields
 * byte-identical rows — the scaffold is cheap to (re)build on demand for the worked-on file set rather
 * than eagerly across the whole repo. Directory rollups and clustering are deferred (task-27.1.3); they
 * arrive as alternative {@link ModuleResolver} implementations, not edits to this writer.
 */

import type { EdgeRow, NodeRow } from "@code-charter/types";

import { parse_anchor } from "../resolver";

/** The path-derived id of a file-module group is this prefix followed by the file path (or sentinel). */
export const MODULE_GROUP_PREFIX = "agentic.group:file:";
/** The `origin` stamped on scaffold rows — they are derived structure, never re-attachable content. */
export const MODULE_SCAFFOLD_ORIGIN = "module-scaffold";
/** The single group label/id for leaves whose defining file resolves outside the analyzed root. */
export const EXTERNAL_GROUP_LABEL = "<external>";
export const EXTERNAL_GROUP_ID = `${MODULE_GROUP_PREFIX}${EXTERNAL_GROUP_LABEL}`;

/** The defining file of an anchored leaf: the `symbol_path` segment before the first `#`. */
export function file_of_symbol_path(symbol_path: string): string {
  const hash = symbol_path.indexOf("#");
  if (hash === -1) {
    throw new Error(`Malformed symbol_path (no '#' file separator): ${symbol_path}`);
  }
  return symbol_path.slice(0, hash);
}

/** Deterministic group id for a defining file. Path-derived, never hashed (AC#9). */
export function module_group_id(file_path: string): string {
  return `${MODULE_GROUP_PREFIX}${file_path}`;
}

/**
 * Maps a leaf node to its first-parent group. This is the task-27.1.3 seam: directory rollups and
 * clustering are alternative implementations of this one method, leaving {@link build_module_scaffold}
 * unchanged.
 */
export interface ModuleResolver {
  /** The group a leaf belongs to, or null when the leaf is not bucketed (no anchor). */
  group_for(leaf: NodeRow): { group_id: string; label: string } | null;
}

/**
 * The first-milestone resolver: one group per defining file, id derived purely from the file path.
 * Files outside `analyzed_root` collapse into the single `<external>` group. `analyzed_root` is a
 * repo-relative, forward-slash prefix (the empty string means the whole repo is in-root).
 */
export function file_module_resolver(analyzed_root: string): ModuleResolver {
  return {
    group_for(leaf) {
      if (leaf.anchor === null) return null;
      const file = file_of_symbol_path(parse_anchor(leaf.anchor).symbol_path);
      if (!is_within_root(file, analyzed_root)) {
        return { group_id: EXTERNAL_GROUP_ID, label: EXTERNAL_GROUP_LABEL };
      }
      return { group_id: module_group_id(file), label: file };
    },
  };
}

/** True when `file` is the analyzed root or sits beneath it. An empty root contains everything. */
function is_within_root(file: string, analyzed_root: string): boolean {
  if (analyzed_root === "") return true;
  const root = analyzed_root.endsWith("/") ? analyzed_root.slice(0, -1) : analyzed_root;
  return file === root || file.startsWith(`${root}/`);
}

export interface ModuleScaffold {
  module_nodes: NodeRow[];
  contains_edges: EdgeRow[];
}

/**
 * Build the file-module tier for `leaves`: one `agentic.group` node per distinct group the resolver
 * assigns, plus one `agentic.contains` edge per leaf (leaf → module, per AC#9). Output is sorted by
 * group id then leaf id, so the same leaf set yields identical rows on every recompute regardless of
 * input order. Anchorless leaves are skipped (module membership is defined only for anchored code).
 */
export function build_module_scaffold(leaves: readonly NodeRow[], resolver: ModuleResolver): ModuleScaffold {
  const groups = new Map<string, { label: string; members: string[] }>();
  for (const leaf of leaves) {
    const group = resolver.group_for(leaf);
    if (group === null) continue;
    const entry = groups.get(group.group_id) ?? { label: group.label, members: [] };
    entry.members.push(leaf.id);
    groups.set(group.group_id, entry);
  }

  const module_nodes: NodeRow[] = [];
  const contains_edges: EdgeRow[] = [];
  for (const group_id of [...groups.keys()].sort()) {
    const { label, members } = groups.get(group_id)!;
    module_nodes.push(module_node(group_id, label));
    for (const leaf_id of [...members].sort()) {
      contains_edges.push(contains_edge(group_id, leaf_id));
    }
  }
  return { module_nodes, contains_edges };
}

function module_node(group_id: string, label: string): NodeRow {
  return {
    id: group_id,
    kind: "agentic.group",
    path: label === EXTERNAL_GROUP_LABEL ? "" : label,
    anchor: null,
    layer: "agentic",
    attributes: { label, group_kind: "file-module" },
    field_ownership: {},
    origin: MODULE_SCAFFOLD_ORIGIN,
    intent_source: "code-edit",
    deleted_at: null,
  };
}

function contains_edge(group_id: string, leaf_id: string): EdgeRow {
  return {
    key: `agentic.contains:${leaf_id}->${group_id}`,
    src_id: leaf_id,
    dst_id: group_id,
    kind: "agentic.contains",
    confidence: 1,
    layer: "agentic",
    attributes: {},
    field_ownership: {},
    origin: MODULE_SCAFFOLD_ORIGIN,
    intent_source: "code-edit",
    adjudication: null,
    deleted_at: null,
  };
}
