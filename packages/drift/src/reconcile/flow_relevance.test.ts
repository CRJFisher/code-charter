import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";

import { filter_flow_relevant, is_flow_relevant } from "./flow_relevance";

describe("is_flow_relevant", () => {
  let repo: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "flow-relevance-"));
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("keeps a supported source by extension without touching the filesystem", () => {
    // The file need not exist: a supported extension is decided from the path alone.
    expect(is_flow_relevant(path.join(repo, "src", "a.ts"), repo)).toBe(true);
  });

  it.each([".ts", ".tsx", ".js", ".jsx", ".py", ".rs"])("keeps a %s source", (ext) => {
    expect(is_flow_relevant(path.join(repo, `mod${ext}`), repo)).toBe(true);
  });

  it("keeps a non-source file that lives under a SKILL.md ancestor", () => {
    const skill = path.join(repo, "skills", "foo");
    fs.mkdirSync(skill, { recursive: true });
    fs.writeFileSync(path.join(skill, "SKILL.md"), "# skill");
    expect(is_flow_relevant(path.join(skill, "notes.md"), repo)).toBe(true);
  });

  it("drops a standalone .md with no SKILL.md ancestor", () => {
    expect(is_flow_relevant(path.join(repo, "README.md"), repo)).toBe(false);
  });

  it("drops .json and dotfile config", () => {
    expect(is_flow_relevant(path.join(repo, "package.json"), repo)).toBe(false);
    expect(is_flow_relevant(path.join(repo, ".gitignore"), repo)).toBe(false);
  });
});

describe("filter_flow_relevant", () => {
  let repo: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "flow-relevance-"));
    const skill = path.join(repo, "skills", "foo");
    fs.mkdirSync(skill, { recursive: true });
    fs.writeFileSync(path.join(skill, "SKILL.md"), "# skill");
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("partitions a mixed turn into flow-relevant vs dropped, preserving input order", () => {
    const worked_on = [
      path.join(repo, "src", "a.ts"),
      path.join(repo, "README.md"),
      path.join(repo, "skills", "foo", "notes.md"),
      path.join(repo, "package.json"),
    ];
    const { relevant, dropped } = filter_flow_relevant(worked_on, repo);
    expect(relevant).toEqual([
      path.join(repo, "src", "a.ts"),
      path.join(repo, "skills", "foo", "notes.md"),
    ]);
    expect(dropped).toEqual([path.join(repo, "README.md"), path.join(repo, "package.json")]);
  });

  it("returns empty partitions for an empty set", () => {
    expect(filter_flow_relevant([], repo)).toEqual({ relevant: [], dropped: [] });
  });

  it("drops a whole turn of docs/config (the standalone-doc no-op case)", () => {
    const { relevant, dropped } = filter_flow_relevant(
      [path.join(repo, "README.md"), path.join(repo, "docs", "guide.md")],
      repo,
    );
    expect(relevant).toEqual([]);
    expect(dropped).toHaveLength(2);
  });
});
