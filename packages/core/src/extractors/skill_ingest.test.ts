import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { SqliteGraphStore } from "../storage/sqlite_graph_store";
import {
  LITERAL_DOC_EDGE_KIND,
  SKILL_DOC_KIND,
  SKILL_TO_REFERENCE_KIND,
  SKILL_TO_SCRIPT_KIND,
  SKILL_TO_SUBAGENT_KIND,
} from "./extractor_ids";
import { ingest_skill } from "./skill_ingest";
import type { SkillIngestDeps } from "./skill_ingest";

const SKILLS_ROOT = join(__dirname, "__fixtures__", "skills");

function list_recursive(dir: string, base: string = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...list_recursive(full, base));
    else out.push(relative(base, full).split(sep).join("/"));
  }
  return out;
}

const fs_deps: SkillIngestDeps = {
  read_file: (path) => readFileSync(path, "utf8"),
  list_files: (skill_dir) => list_recursive(skill_dir),
};

function ingest(name: string): SqliteGraphStore {
  const store = new SqliteGraphStore(":memory:");
  ingest_skill(store, join(SKILLS_ROOT, name), fs_deps);
  return store;
}

describe("ingest_skill (task-27.1.4 AC#6)", () => {
  describe("apply-practices (trivial — single node, no edges)", () => {
    let store: SqliteGraphStore;
    beforeEach(() => (store = ingest("apply-practices")));
    afterEach(() => store.close());

    it("emits exactly the SKILL.md doc node with frontmatter attributes and no edges", () => {
      const nodes = store.all_nodes();
      expect(nodes).toHaveLength(1);
      const [node] = nodes;
      expect(node.id).toBe("apply-practices/SKILL.md#doc");
      expect(node.kind).toBe(SKILL_DOC_KIND);
      expect(node.anchor).toBeNull();
      expect(node.attributes).toMatchObject({
        name: "apply-practices",
        user_invocable: true,
      });
      expect(store.all_edges()).toHaveLength(0); // external/neighbour links never become edges
    });
  });

  describe("drive-folder-sync (medium — one script, deduped link)", () => {
    let store: SqliteGraphStore;
    beforeEach(() => (store = ingest("drive-folder-sync")));
    afterEach(() => store.close());

    it("links SKILL.md → script as one edge with two provenance rows", () => {
      const edges = store.all_edges();
      expect(edges).toHaveLength(1);
      expect(edges[0].kind).toBe(SKILL_TO_SCRIPT_KIND);
      expect(edges[0].dst_id).toBe("drive-folder-sync/scripts/sync_template.py#doc");
      expect(store.provenance_for_edge(edges[0].key)).toHaveLength(2); // two link occurrences
    });

    it("normalizes allowed-tools into a tools attribute list", () => {
      const skill = store.node("drive-folder-sync/SKILL.md#doc");
      expect(skill?.attributes.tools).toEqual(["Bash", "Read", "Write", "Edit", "AskUserQuestion"]);
    });
  });

  describe("skill-diagrammer (rich — fan-out, cross-refs, sub-agent)", () => {
    let store: SqliteGraphStore;
    beforeEach(() => (store = ingest("skill-diagrammer")));
    afterEach(() => store.close());

    it("renders the full fan-out with deduped multiplicity and reciprocal cross-refs", () => {
      const by_kind = (kind: string) => store.all_edges().filter((e) => e.kind === kind);

      const refs = by_kind(SKILL_TO_REFERENCE_KIND);
      expect(refs.map((e) => e.dst_id).sort()).toEqual([
        "skill-diagrammer/anatomy.md#doc",
        "skill-diagrammer/methodology.md#doc",
      ]);
      const anatomy_edge = refs.find((e) => e.dst_id === "skill-diagrammer/anatomy.md#doc")!;
      expect(store.provenance_for_edge(anatomy_edge.key)).toHaveLength(2); // anatomy linked twice → one edge

      expect(by_kind(SKILL_TO_SCRIPT_KIND).map((e) => e.dst_id)).toEqual(["skill-diagrammer/scripts/describe.ts#doc"]);

      const cross = by_kind(LITERAL_DOC_EDGE_KIND);
      expect(cross.map((e) => `${e.src_id}->${e.dst_id}`).sort()).toEqual([
        "skill-diagrammer/anatomy.md#doc->skill-diagrammer/methodology.md#doc",
        "skill-diagrammer/methodology.md#doc->skill-diagrammer/anatomy.md#doc",
      ]);
    });

    it("links the meta.json sub_agents[] declaration with provenance into meta.json", () => {
      const subagent = store.all_edges().filter((e) => e.kind === SKILL_TO_SUBAGENT_KIND);
      expect(subagent).toHaveLength(1);
      expect(subagent[0].dst_id).toBe("skill-diagrammer/agents/reviewer.md#doc");
      const prov = store.provenance_for_edge(subagent[0].key);
      expect(prov[0].source_file).toBe("skill-diagrammer/meta.json");
      expect(prov[0].source_range).toMatch(/^\d+:\d+-\d+:\d+$/);
    });
  });

  it("is idempotent: re-ingesting yields the same node and edge counts", () => {
    const store = new SqliteGraphStore(":memory:");
    const dir = join(SKILLS_ROOT, "skill-diagrammer");
    ingest_skill(store, dir, fs_deps);
    const nodes1 = store.all_nodes().length;
    const edges1 = store.all_edges().length;
    ingest_skill(store, dir, fs_deps);
    expect(store.all_nodes()).toHaveLength(nodes1);
    expect(store.all_edges()).toHaveLength(edges1);
    store.close();
  });
});
