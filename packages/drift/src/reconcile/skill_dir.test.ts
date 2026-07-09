import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { open_graph_store, type GraphStore } from "@code-charter/core";

import { assess_skill_bundle, find_skill_root, ingest_skill_dir } from "./skill_dir";

let repo: string;

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "skill-dir-"));
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

function make_skill(rel_dir: string, files: Record<string, string> = {}): string {
  const dir = path.join(repo, rel_dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), "# skill\n");
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(dir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return dir;
}

describe("find_skill_root", () => {
  it("returns the skill dir for a file sitting directly in the bundle", () => {
    const skill = make_skill("skills/foo");
    expect(find_skill_root(path.join(skill, "notes.md"), repo)).toBe(skill);
  });

  it("walks up to the nearest ancestor holding a SKILL.md", () => {
    const skill = make_skill("skills/foo");
    const deep = path.join(skill, "references", "deep", "leaf.md");
    expect(find_skill_root(deep, repo)).toBe(skill);
  });

  it("returns the innermost bundle when skills are nested", () => {
    make_skill("skills/foo");
    const inner = make_skill("skills/foo/sub");
    expect(find_skill_root(path.join(inner, "notes.md"), repo)).toBe(inner);
  });

  it("returns the directory itself when passed a skill dir path", () => {
    const skill = make_skill("skills/foo");
    expect(find_skill_root(skill, repo)).toBe(skill);
  });

  it("returns undefined when no ancestor up to the repo root holds a SKILL.md", () => {
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    expect(find_skill_root(path.join(repo, "src", "a.ts"), repo)).toBeUndefined();
  });

  it("returns the repo root when the SKILL.md lives at the root", () => {
    fs.writeFileSync(path.join(repo, "SKILL.md"), "# root skill\n");
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    expect(find_skill_root(path.join(repo, "src", "a.ts"), repo)).toBe(path.resolve(repo));
  });

  it("does not escape above the repo root to find a SKILL.md", () => {
    fs.writeFileSync(path.join(repo, "SKILL.md"), "# above\n");
    const inner = path.join(repo, "nested");
    fs.mkdirSync(path.join(inner, "src"), { recursive: true });
    expect(find_skill_root(path.join(inner, "src", "a.ts"), inner)).toBeUndefined();
  });
});

describe("ingest_skill_dir", () => {
  let store: GraphStore;

  beforeEach(() => {
    store = open_graph_store(path.join(repo, "graph.db"));
  });

  afterEach(() => {
    store.close();
  });

  it("ingests a bundle off disk, writing doc nodes for SKILL.md and its linked script", () => {
    const skill = make_skill("skills/foo", {
      "scripts/run.py": "print('hi')\n",
    });
    fs.writeFileSync(path.join(skill, "SKILL.md"), "# skill\n\nSee [runner](scripts/run.py).\n");

    const result = ingest_skill_dir(store, skill);

    expect(result.skill).toBe("foo");
    expect(result.doc_node_ids).toContain("foo/SKILL.md#doc");
    expect(result.doc_node_ids).toContain("foo/scripts/run.py#doc");
    expect(result.edge_keys.length).toBeGreaterThan(0);

    const node_ids = store.all_nodes().map((n) => n.id);
    expect(node_ids).toContain("foo/SKILL.md#doc");
    expect(node_ids).toContain("foo/scripts/run.py#doc");
  });

  it("returns an empty result for a directory with no SKILL.md", () => {
    const dir = path.join(repo, "plain");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "notes.md"), "# notes\n");

    const result = ingest_skill_dir(store, dir);

    expect(result.doc_node_ids).toEqual([]);
    expect(result.edge_keys).toEqual([]);
    expect(store.all_nodes()).toEqual([]);
  });
});

describe("assess_skill_bundle (partial/degraded-write guard, AC#2)", () => {
  it("passes a healthy bundle with a present sub-agent file", () => {
    const skill = make_skill("skills/foo", {
      "agents/reviewer.md": "# reviewer\n",
      "meta.json": JSON.stringify({ sub_agents: [{ name: "reviewer", file: "agents/reviewer.md" }] }),
    });
    fs.writeFileSync(path.join(skill, "SKILL.md"), "# skill\n\nbody\n");

    expect(assess_skill_bundle(skill)).toBeUndefined();
  });

  it("defers a bundle whose SKILL.md is empty (a mid-edit truncation)", () => {
    const skill = make_skill("skills/foo");
    fs.writeFileSync(path.join(skill, "SKILL.md"), "   \n");

    expect(assess_skill_bundle(skill)).toContain("SKILL.md is empty");
  });

  it("defers a bundle whose SKILL.md is unreadable/absent", () => {
    const dir = path.join(repo, "skills/gone");
    fs.mkdirSync(dir, { recursive: true });

    expect(assess_skill_bundle(dir)).toContain("SKILL.md unreadable");
  });

  it("defers a bundle whose meta.json declares a sub-agent file missing from disk", () => {
    const skill = make_skill("skills/foo", {
      "meta.json": JSON.stringify({ sub_agents: [{ name: "reviewer", file: "agents/reviewer.md" }] }),
    });

    expect(assess_skill_bundle(skill)).toContain("declared sub-agent file missing from bundle: agents/reviewer.md");
  });

  it("defers a bundle whose meta.json is truncated/unparseable (silently drops every sub-agent bridge otherwise)", () => {
    const skill = make_skill("skills/foo", { "meta.json": '{ "sub_agents": [ { "name": "revie' });
    fs.writeFileSync(path.join(skill, "SKILL.md"), "# skill\n\nbody\n");

    expect(assess_skill_bundle(skill)).toContain("meta.json is unparseable");
  });

  it("passes a bundle whose sub-agent declaration points outside the bundle (external, not a defect)", () => {
    const skill = make_skill("skills/foo", {
      "meta.json": JSON.stringify({ sub_agents: [{ name: "external", file: "/opt/agents/x.md" }] }),
    });

    expect(assess_skill_bundle(skill)).toBeUndefined();
  });

  it("passes a bundle whose sub-agent path escapes the bundle root (ingest ignores it too, not a defect)", () => {
    const skill = make_skill("skills/foo", {
      // A `..`-segment and a filename literally beginning with `..` both resolve outside the bundle,
      // exactly as ingest's resolver treats them — neither absent target is a defect.
      "meta.json": JSON.stringify({
        sub_agents: [
          { name: "shared", file: "../shared/reviewer.md" },
          { name: "weird", file: "..reviewer.md" },
        ],
      }),
    });

    expect(assess_skill_bundle(skill)).toBeUndefined();
  });

  it("passes a bundle with no meta.json (no sub-agent declarations to verify)", () => {
    const skill = make_skill("skills/foo");
    fs.writeFileSync(path.join(skill, "SKILL.md"), "# skill\n\nbody\n");

    expect(assess_skill_bundle(skill)).toBeUndefined();
  });
});
