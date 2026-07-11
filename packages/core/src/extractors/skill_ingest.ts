/**
 * Skill-directory ingestion into the shared `GraphStore` as raw-tier rows.
 *
 * A skill directory (SKILL.md + scripts/ + references + agents/ + meta.json) becomes doc nodes plus
 * `skill.to_script` / `skill.to_reference` / `code.literal-doc` / `skill.to_subagent` edges, each with
 * provenance pointing at the exact link/declaration span. The reciprocal `code.literal-doc` edges
 * between references populate the doc corpus gap-detection reads.
 *
 * Scope: markdown links, reciprocal reference cross-refs, `meta.json sub_agents[]`, and
 * frontmatter-as-attributes.
 *
 * Ingestion is bundle-centric: the unit of invalidation is the whole skill dir, so it uses scoped
 * `invalidate_* + upsert_*` rather than store-global `rebuild_layer` (which would nuke other skills'
 * raw rows). The host injects file IO so core imports no `fs`.
 */

import { join } from "node:path";

import type { EdgeRow, GraphStore, NodeRow, ProvenanceRow } from "@code-charter/types";

import {
  EXTRACTOR_ID_MARKDOWN,
  EXTRACTOR_ID_META_JSON,
  EXTRACTOR_VERSION,
  LITERAL_DOC_EDGE_KIND,
  SKILL_DOC_KIND,
  SKILL_INGEST_ORIGIN,
  SKILL_TO_REFERENCE_KIND,
  SKILL_TO_SCRIPT_KIND,
  SKILL_TO_SUBAGENT_KIND,
} from "./extractor_ids";
import { parse_frontmatter } from "./frontmatter";
import { parse_markdown_links } from "./markdown_links";
import { read_sub_agents } from "./meta_json";

/** Host-supplied file IO, so core stays filesystem-agnostic. */
export interface SkillIngestDeps {
  /** Read a bundle file's UTF-8 text given its absolute/host path. */
  read_file: (path: string) => string;
  /** List every bundle file as a path relative to the skill dir (posix separators). */
  list_files: (skill_dir: string) => string[];
}

export interface SkillIngestResult {
  /** The skill dir name used as the id/path prefix. */
  skill: string;
  doc_node_ids: string[];
  edge_keys: string[];
}

const SKILL_FILE = "SKILL.md";
const META_FILE = "meta.json";

function last_segment(path: string): string {
  const parts = path.split(/[\\/]/).filter((p) => p.length > 0);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

function posix_dirname(rel: string): string {
  const idx = rel.lastIndexOf("/");
  return idx === -1 ? "" : rel.slice(0, idx);
}

/** Resolve a posix-normalized path, collapsing `.`/`..` segments. */
function posix_normalize(rel: string): string {
  const out: string[] = [];
  for (const segment of rel.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0 || out[out.length - 1] === "..") out.push("..");
      else out.pop();
    } else {
      out.push(segment);
    }
  }
  return out.join("/");
}

const EXTERNAL = /^(~|\/|[a-z][a-z0-9+.-]*:)/i;

/** Builder for the bundle's rows, accumulating nodes (deduped) and edges (deduped, multi-provenance). */
class SkillRows {
  readonly nodes = new Map<string, NodeRow>();
  readonly edges = new Map<string, { edge: EdgeRow; provenance: ProvenanceRow[] }>();

  constructor(private readonly skill: string) {}

  node_path(rel: string): string {
    return `${this.skill}/${rel}`;
  }
  node_id(rel: string): string {
    return `${this.node_path(rel)}#doc`;
  }

  ensure_doc(rel: string, attributes: Record<string, unknown> = {}): string {
    const id = this.node_id(rel);
    if (!this.nodes.has(id)) {
      this.nodes.set(id, {
        id,
        kind: SKILL_DOC_KIND,
        path: this.node_path(rel),
        anchor: null,
        layer: "raw",
        attributes,
        field_ownership: {},
        origin: SKILL_INGEST_ORIGIN,
        intent_source: "code-edit",
        deleted_at: null,
      });
    } else if (Object.keys(attributes).length > 0) {
      Object.assign(this.nodes.get(id)!.attributes, attributes);
    }
    return id;
  }

  add_edge(
    src_id: string,
    dst_id: string,
    kind: string,
    extractor_id: string,
    source_file: string,
    source_range: string,
  ): void {
    const key = `${kind}:${src_id}->${dst_id}`;
    const existing = this.edges.get(key);
    const prov: ProvenanceRow = {
      edge_key: key,
      source_file,
      source_range,
      extractor_id,
      extractor_version: EXTRACTOR_VERSION,
    };
    if (existing) {
      // Same (src, dst, kind) seen again — one edge, one more provenance row (dedup with multiplicity).
      if (!existing.provenance.some((p) => p.source_range === source_range && p.source_file === source_file)) {
        existing.provenance.push(prov);
      }
      return;
    }
    this.edges.set(key, {
      edge: {
        key,
        src_id,
        dst_id,
        kind,
        confidence: 1,
        layer: "raw",
        attributes: {},
        field_ownership: {},
        origin: SKILL_INGEST_ORIGIN,
        intent_source: "code-edit",
        adjudication: null,
        deleted_at: null,
      },
      provenance: [prov],
    });
  }
}

/** Classify an in-bundle link target into its skill edge kind. */
function edge_kind_for(target_rel: string): string {
  return target_rel.startsWith("scripts/") ? SKILL_TO_SCRIPT_KIND : SKILL_TO_REFERENCE_KIND;
}

/**
 * Ingest one skill directory into `store` as raw-tier rows. Returns the ids written. Re-running is
 * idempotent: the bundle's prior raw rows are invalidated first, then rebuilt from current source.
 */
export function ingest_skill(store: GraphStore, skill_dir: string, deps: SkillIngestDeps): SkillIngestResult {
  const skill = last_segment(skill_dir);
  const files = deps.list_files(skill_dir).map((f) => f.replace(/\\/g, "/"));
  const file_set = new Set(files);
  if (!file_set.has(SKILL_FILE)) {
    return { skill, doc_node_ids: [], edge_keys: [] };
  }

  const rows = new SkillRows(skill);

  /** Resolve a link target written in `from_rel` to an in-bundle file, or null if external/missing. */
  const resolve = (from_rel: string, path_target: string): string | null => {
    if (EXTERNAL.test(path_target)) return null;
    const resolved = posix_normalize(`${posix_dirname(from_rel)}/${path_target}`);
    if (resolved === "" || resolved.startsWith("..")) return null;
    return file_set.has(resolved) ? resolved : null;
  };

  const skill_source = deps.read_file(join(skill_dir, SKILL_FILE));
  const skill_id = rows.ensure_doc(SKILL_FILE, parse_frontmatter(skill_source));
  const skill_source_file = rows.node_path(SKILL_FILE);

  const reference_targets: string[] = [];
  for (const link of parse_markdown_links(skill_source)) {
    const target = resolve(SKILL_FILE, link.path_target);
    if (target === null) continue;
    const target_id = rows.ensure_doc(target);
    const kind = edge_kind_for(target);
    rows.add_edge(skill_id, target_id, kind, EXTRACTOR_ID_MARKDOWN, skill_source_file, link.source_range);
    if (kind === SKILL_TO_REFERENCE_KIND && target.endsWith(".md")) reference_targets.push(target);
  }

  for (const ref of reference_targets) {
    let ref_source: string;
    try {
      ref_source = deps.read_file(join(skill_dir, ref));
    } catch {
      continue;
    }
    const ref_id = rows.node_id(ref);
    const ref_source_file = rows.node_path(ref);
    for (const link of parse_markdown_links(ref_source)) {
      const target = resolve(ref, link.path_target);
      if (target === null || target === ref || !target.endsWith(".md")) continue;
      const target_id = rows.ensure_doc(target);
      rows.add_edge(ref_id, target_id, LITERAL_DOC_EDGE_KIND, EXTRACTOR_ID_MARKDOWN, ref_source_file, link.source_range);
    }
  }

  // Only the literal `skill.to_subagent` edge is written here; the agentic bridge candidate is
  // produced separately by the registry detector over the same `read_sub_agents` output.
  if (file_set.has(META_FILE)) {
    const meta_source = deps.read_file(join(skill_dir, META_FILE));
    const meta_source_file = rows.node_path(META_FILE);
    for (const decl of read_sub_agents(meta_source)) {
      if (decl.file === null) continue;
      const target = resolve(META_FILE, decl.file);
      if (target === null) continue;
      const target_id = rows.ensure_doc(target);
      rows.add_edge(skill_id, target_id, SKILL_TO_SUBAGENT_KIND, EXTRACTOR_ID_META_JSON, meta_source_file, decl.source_range);
    }
  }

  const bundle_paths = files.map((rel) => rows.node_path(rel));
  store.invalidate_edges_for_files(bundle_paths);
  store.invalidate_nodes_for_files(bundle_paths);
  for (const node of [...rows.nodes.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    store.upsert_node(node);
  }
  const sorted_edges = [...rows.edges.values()].sort((a, b) => (a.edge.key < b.edge.key ? -1 : 1));
  for (const { edge, provenance } of sorted_edges) {
    store.upsert_edge(edge, provenance);
  }

  return {
    skill,
    doc_node_ids: [...rows.nodes.keys()].sort(),
    edge_keys: [...rows.edges.keys()].sort(),
  };
}
