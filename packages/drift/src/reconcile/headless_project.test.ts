import { describe, expect, it } from "@jest/globals";

import { HeadlessProject, is_supported_source } from "./headless_project";

describe("is_supported_source", () => {
  it.each([".ts", ".tsx", ".js", ".jsx", ".py", ".rs"])(
    "accepts %s sources Ariadne can parse",
    (ext) => {
      expect(is_supported_source(`/repo/file${ext}`)).toBe(true);
    },
  );

  it("matches the extension case-insensitively", () => {
    expect(is_supported_source("/repo/File.TS")).toBe(true);
    expect(is_supported_source("/repo/Mod.PY")).toBe(true);
  });

  it("rejects unsupported and extensionless paths", () => {
    expect(is_supported_source("/repo/notes.txt")).toBe(false);
    expect(is_supported_source("/repo/data.json")).toBe(false);
    expect(is_supported_source("/repo/Makefile")).toBe(false);
  });
});

describe("HeadlessProject.get_call_graph", () => {
  it("returns an empty graph before initialize so callers never read undefined", () => {
    const project = new HeadlessProject("/repo/never-initialized");
    const graph = project.get_call_graph();
    expect(graph.nodes.size).toBe(0);
    expect(graph.entry_points).toEqual([]);
  });
});
