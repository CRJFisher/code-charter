import { describe, expect, it } from "@jest/globals";

import { list_outstanding_drift, parse_porcelain, type RunGit } from "./git_drift";

describe("parse_porcelain", () => {
  it("extracts paths for modified, added, and untracked entries", () => {
    const output = " M src/a.ts\nA  src/b.ts\n?? src/c.ts\n";
    expect(parse_porcelain(output)).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
  });

  it("uses the new path for a rename", () => {
    expect(parse_porcelain("R  src/old.ts -> src/new.ts\n")).toEqual(["src/new.ts"]);
  });

  it("ignores blank lines", () => {
    expect(parse_porcelain("")).toEqual([]);
  });
});

describe("list_outstanding_drift", () => {
  it("runs git status --porcelain and parses the result", () => {
    const calls: string[][] = [];
    const run_git: RunGit = (args) => {
      calls.push([...args]);
      return " M src/a.ts\n";
    };
    expect(list_outstanding_drift("/repo", run_git)).toEqual(["src/a.ts"]);
    expect(calls).toEqual([["status", "--porcelain"]]);
  });

  it("degrades to [] when git is unavailable or fails", () => {
    const run_git: RunGit = () => {
      throw new Error("git not found");
    };
    expect(list_outstanding_drift("/repo", run_git)).toEqual([]);
  });
});
