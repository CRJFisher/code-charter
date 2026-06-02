import { read_sub_agents } from "./meta_json";

describe("read_sub_agents (task-27.1.4 AC#6/AC#2)", () => {
  it("reads string and object entries with their name spans", () => {
    const source = [
      "{",
      '  "sub_agents": [',
      '    "alpha",',
      '    { "name": "beta", "file": "agents/beta.md" }',
      "  ]",
      "}",
    ].join("\n");
    const decls = read_sub_agents(source);
    expect(decls).toEqual([
      { name: "alpha", file: null, source_range: "3:4-3:11" },
      { name: "beta", file: "agents/beta.md", source_range: "4:14-4:20" },
    ]);
  });

  it("returns [] when sub_agents is absent", () => {
    expect(read_sub_agents('{ "name": "skill" }')).toEqual([]);
  });

  it("returns [] when sub_agents is not an array", () => {
    expect(read_sub_agents('{ "sub_agents": "nope" }')).toEqual([]);
  });

  it("returns [] on malformed JSON rather than throwing", () => {
    expect(read_sub_agents("{ not json")).toEqual([]);
  });
});
