import { read_sub_agents } from "./meta_json";

describe("read_sub_agents", () => {
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

  it("returns [] for an empty sub_agents array", () => {
    expect(read_sub_agents('{ "sub_agents": [] }')).toEqual([]);
  });

  it("returns [] on malformed JSON rather than throwing", () => {
    expect(read_sub_agents("{ not json")).toEqual([]);
  });

  it("returns [] when the root is not an object", () => {
    expect(read_sub_agents("[1, 2, 3]")).toEqual([]);
    expect(read_sub_agents("42")).toEqual([]);
  });

  it("skips entries that carry no usable name", () => {
    const source = [
      "{",
      '  "sub_agents": [',
      '    { "file": "agents/orphan.md" },',
      '    { "name": 7 },',
      '    "kept"',
      "  ]",
      "}",
    ].join("\n");
    const decls = read_sub_agents(source);
    expect(decls).toEqual([{ name: "kept", file: null, source_range: "5:4-5:10" }]);
  });

  it("drops a non-string file to null", () => {
    const source = '{ "sub_agents": [ { "name": "gamma", "file": 12 } ] }';
    const decls = read_sub_agents(source);
    expect(decls).toEqual([{ name: "gamma", file: null, source_range: "1:28-1:35" }]);
  });

  it("advances the cursor so repeated names get distinct spans", () => {
    const source = [
      "{",
      '  "sub_agents": [',
      '    "dup",',
      '    "dup"',
      "  ]",
      "}",
    ].join("\n");
    const decls = read_sub_agents(source);
    expect(decls).toEqual([
      { name: "dup", file: null, source_range: "3:4-3:9" },
      { name: "dup", file: null, source_range: "4:4-4:9" },
    ]);
  });

  it("falls back to the sub_agents key span when a name literal cannot be located", () => {
    const source = '{ "sub_agents": [ { "name": "a\\"b" } ] }';
    const decls = read_sub_agents(source);
    expect(decls).toEqual([{ name: 'a"b', file: null, source_range: "1:2-1:14" }]);
  });
});
