/**
 * Persisting and reading a hydrated flow, scoped. Writes go row-by-row (`upsert` + stale-edge
 * retirement), never `rebuild_layer('agentic')` — that is store-global and would destroy every *other*
 * flow's agentic content, defeating the lazy, per-flow hydration model (the same reason `re_extract`
 * rebuilds the scaffold with scoped upserts). A flow node is agent-authored, so each sync upserts it
 * wholesale.
 */

import type { EdgeRow, GraphStore, NodeRow } from "@code-charter/core";
import {
  build_flow_member_edges,
  build_flow_node,
  collect_persisted_flow,
  file_of_symbol_path,
  FLOW_MEMBER_EDGE_KIND,
  FLOW_NODE_KIND,
} from "@code-charter/core";

export interface PersistedFlow {
  node: NodeRow;
  member_edges: readonly EdgeRow[];
  bridge_edges: readonly EdgeRow[];
}

/** Namespace prefix of skill-flow ids — the discriminator between skill and code flows. */
const SKILL_FLOW_ID_PREFIX = "agentic.flow:skill:";

/** A skill bundle's flow id — namespaced so it never collides with the SKILL.md doc node it includes. */
export function skill_flow_id(skill_name: string): string {
  return `${SKILL_FLOW_ID_PREFIX}${skill_name}`;
}

/**
 * Skill-vs-code flow discrimination by id namespace. The id is the identity contract; member-edge
 * shape is not (a code flow may legitimately carry linked-doc member edges).
 */
export function is_skill_flow_id(flow_id: string): boolean {
  return flow_id.startsWith(SKILL_FLOW_ID_PREFIX);
}

/** Reads only live flows: `deleted_at === null` excludes soft-deleted (retired) nodes. */
export function read_persisted_flows(store: GraphStore): PersistedFlow[] {
  const edges = store.all_edges();
  return store
    .all_nodes()
    .filter((node) => node.kind === FLOW_NODE_KIND && node.deleted_at === null)
    .map((node) => {
      const rows = collect_persisted_flow(node.id, [node], edges)!;
      return { node: rows.flow_node, member_edges: rows.member_edges, bridge_edges: rows.bridge_edges };
    });
}

/** Read one persisted flow by id, or undefined when it has no live `agentic.flow` node. */
export function read_persisted_flow(store: GraphStore, flow_id: string): PersistedFlow | undefined {
  const rows = collect_persisted_flow(flow_id, store.all_nodes(), store.all_edges());
  return rows === undefined ? undefined : { node: rows.flow_node, member_edges: rows.member_edges, bridge_edges: rows.bridge_edges };
}

/**
 * A flow's stored `entry_points` symbol_paths. The attribute is agent-authored and upserted
 * wholesale, so its shape is not trusted: a missing/non-array value or non-string element is
 * dropped rather than thrown on.
 */
export function stored_seed_paths(flow: PersistedFlow): string[] {
  const stored = flow.node.attributes.entry_points;
  return Array.isArray(stored) ? stored.filter((seed_path): seed_path is string => typeof seed_path === "string") : [];
}

/**
 * A skill flow's stored repo-relative bundle directory, or undefined. The doc-node id space
 * (`<skill_basename>/<rel>#doc`) does not embed the bundle's on-disk location, so this attribute is
 * the only way the stale-flow sweep can check whether the bundle's SKILL.md still exists. Same
 * untrusted-attribute discipline as {@link stored_seed_paths}.
 */
export function stored_skill_root(flow: PersistedFlow): string | undefined {
  const stored = flow.node.attributes.skill_root;
  return typeof stored === "string" ? stored : undefined;
}

/**
 * The repo-relative files a code flow's stored `entry_points` live in, deduped. A seed symbol_path
 * embeds its defining file (`<file>#<qualified>:<kind>`); an entry point without the `#` separator
 * (malformed, or a non-code id) names no file and is skipped.
 */
export function stored_seed_files(flow: PersistedFlow): string[] {
  return [
    ...new Set(
      stored_seed_paths(flow)
        .filter((seed_path) => seed_path.includes("#"))
        .map((seed_path) => file_of_symbol_path(seed_path)),
    ),
  ];
}

export interface WriteFlowArgs {
  id: string;
  label: string;
  /** Seed entrypoint `symbol_path`s — the flow's `entry_points`. */
  seed_paths: readonly string[];
  /** Non-seed members (linked docs) — what `agentic.flow_member` edges point at. Empty for a pure code flow. */
  member_ids: readonly string[];
  rationale: string;
  /** The sorted full induced member set — the membership snapshot that drives membership-drift re-sync. */
  anchor_set: readonly string[];
  last_synced_at: string;
  /** Repo-relative bundle dir — skill flows only ({@link stored_skill_root}). Code flows omit it. */
  skill_root?: string;
}

/**
 * Persist (or refresh) one flow: the `agentic.flow` node, its `agentic.flow_member` edges (stale ones
 * retired), and its bridges. Idempotent and deterministic — a re-run with identical input is a clean
 * REPLACE.
 */
export function write_flow(store: GraphStore, args: WriteFlowArgs): void {
  const node = build_flow_node({
    id: args.id,
    label: args.label,
    entry_points: [...args.seed_paths],
    exit_points: [],
    rationale: args.rationale,
    last_synced_at: args.last_synced_at,
  });
  const anchor_set = [...args.anchor_set].sort();
  node.attributes.member_count = anchor_set.length;
  node.attributes.anchor_set = anchor_set;
  if (args.skill_root !== undefined) node.attributes.skill_root = args.skill_root;

  store.upsert_node(node);

  const fresh = build_flow_member_edges(args.id, args.member_ids);
  const fresh_keys = new Set(fresh.map((e) => e.key));
  for (const stale of store.all_edges()) {
    if (stale.kind === FLOW_MEMBER_EDGE_KIND && stale.src_id === args.id && !fresh_keys.has(stale.key)) {
      store.soft_delete({ kind: "edge", id: stale.key });
    }
  }
  for (const edge of fresh) store.upsert_edge(edge, []);
}
