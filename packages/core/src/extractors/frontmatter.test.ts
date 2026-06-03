import { parse_frontmatter } from "./frontmatter";

describe("parse_frontmatter (task-21.2 AC#4 — tolerant)", () => {
  it("returns {} when there is no frontmatter", () => {
    expect(parse_frontmatter("# Just a heading\n")).toEqual({});
  });

  it("normalizes allowed-tools → tools and parses an inline list", () => {
    const fm = parse_frontmatter("---\nallowed-tools: Bash, Read, Write\n---\nbody");
    expect(fm.tools).toEqual(["Bash", "Read", "Write"]);
    expect(fm).not.toHaveProperty("allowed_tools");
  });

  it("treats a plain tools key the same way", () => {
    expect(parse_frontmatter("---\ntools: Bash, Read\n---\n").tools).toEqual(["Bash", "Read"]);
  });

  it("normalizes user-invocable → user_invocable as a boolean", () => {
    expect(parse_frontmatter("---\nuser-invocable: true\n---\n").user_invocable).toBe(true);
    expect(parse_frontmatter("---\nuser_invocable: false\n---\n").user_invocable).toBe(false);
  });

  it("parses a block-scalar value", () => {
    const fm = parse_frontmatter("---\nname: skill\ndescription: |\n  line one\n  line two\n---\n");
    expect(fm.name).toBe("skill");
    expect(fm.description).toBe("line one\nline two");
  });

  it("parses a YAML block list", () => {
    const fm = parse_frontmatter("---\ntools:\n  - Bash\n  - Read\n---\n");
    expect(fm.tools).toEqual(["Bash", "Read"]);
  });

  it("strips surrounding quotes from a scalar", () => {
    expect(parse_frontmatter('---\nname: "quoted name"\n---\n').name).toBe("quoted name");
  });

  it("keeps a quoted scalar containing commas as one string, not a list", () => {
    const fm = parse_frontmatter('---\ndescription: "data flow, scripts, and artifacts"\n---\n');
    expect(fm.description).toBe("data flow, scripts, and artifacts");
  });
});
