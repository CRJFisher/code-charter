import * as path from "node:path";

import { describe, expect, it } from "@jest/globals";

import { to_abs, to_repo_relative } from "./paths";

const repo_root = path.resolve(path.sep, "repo", "root");

describe("to_repo_relative", () => {
  it("strips the repo root from an absolute path", () => {
    const abs = path.join(repo_root, "src", "a.ts");
    expect(to_repo_relative(abs, repo_root)).toBe("src/a.ts");
  });

  it("leaves a repo-relative input unchanged in repo-relative space", () => {
    expect(to_repo_relative(path.join("src", "a.ts"), repo_root)).toBe("src/a.ts");
  });

  it("emits forward slashes regardless of the platform separator", () => {
    const abs = path.join(repo_root, "a", "b", "c.ts");
    expect(to_repo_relative(abs, repo_root)).toBe("a/b/c.ts");
  });

  it("returns the empty string for the repo root itself", () => {
    expect(to_repo_relative(repo_root, repo_root)).toBe("");
  });

  it("escapes the repo root with a parent segment for paths above it", () => {
    const abs = path.join(repo_root, "..", "sibling", "x.ts");
    expect(to_repo_relative(abs, repo_root)).toBe("../sibling/x.ts");
  });
});

describe("to_abs", () => {
  it("joins a repo-relative path onto the repo root", () => {
    expect(to_abs("src/a.ts", repo_root)).toBe(path.join(repo_root, "src", "a.ts"));
  });

  it("returns an absolute input unchanged", () => {
    const abs = path.join(repo_root, "src", "a.ts");
    expect(to_abs(abs, repo_root)).toBe(abs);
  });
});

describe("round trip", () => {
  it("recovers the original absolute path through to_repo_relative then to_abs", () => {
    const abs = path.join(repo_root, "pkg", "mod", "file.ts");
    expect(to_abs(to_repo_relative(abs, repo_root), repo_root)).toBe(abs);
  });
});
