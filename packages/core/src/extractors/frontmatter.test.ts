import { parse_frontmatter } from "./frontmatter";

describe("parse_frontmatter (task-21.2 AC#4 — tolerant)", () => {
  it("returns {} when there is no frontmatter", () => {
    expect(parse_frontmatter("# Just a heading\n")).toEqual({});
  });

  it("returns {} when the opening fence is never closed", () => {
    expect(parse_frontmatter("---\nname: skill\nno closing fence")).toEqual({});
  });

  it("normalizes allowed-tools → tools and parses an inline list", () => {
    const fm = parse_frontmatter("---\nallowed-tools: Bash, Read, Write\n---\nbody");
    expect(fm.tools).toEqual(["Bash", "Read", "Write"]);
    expect(fm).not.toHaveProperty("allowed_tools");
  });

  it("normalizes the underscore allowed_tools spelling to tools", () => {
    const fm = parse_frontmatter("---\nallowed_tools: Bash, Read\n---\n");
    expect(fm.tools).toEqual(["Bash", "Read"]);
    expect(fm).not.toHaveProperty("allowed_tools");
  });

  it("treats a plain tools key the same way", () => {
    expect(parse_frontmatter("---\ntools: Bash, Read\n---\n").tools).toEqual(["Bash", "Read"]);
  });

  it("folds any other hyphenated key to snake_case", () => {
    expect(parse_frontmatter("---\nmodel-name: opus\n---\n")).toEqual({ model_name: "opus" });
  });

  it("normalizes user-invocable → user_invocable as a boolean", () => {
    expect(parse_frontmatter("---\nuser-invocable: true\n---\n").user_invocable).toBe(true);
    expect(parse_frontmatter("---\nuser_invocable: false\n---\n").user_invocable).toBe(false);
  });

  it("parses a literal block-scalar value, preserving line breaks", () => {
    const fm = parse_frontmatter("---\nname: skill\ndescription: |\n  line one\n  line two\n---\n");
    expect(fm.name).toBe("skill");
    expect(fm.description).toBe("line one\nline two");
  });

  it("folds a > block scalar onto a single space-joined line", () => {
    const fm = parse_frontmatter("---\ndescription: >\n  line one\n  line two\n---\n");
    expect(fm.description).toBe("line one line two");
  });

  it("parses a YAML block list", () => {
    const fm = parse_frontmatter("---\ntools:\n  - Bash\n  - Read\n---\n");
    expect(fm.tools).toEqual(["Bash", "Read"]);
  });

  it("treats a key with an empty value and no list items as an empty string", () => {
    expect(parse_frontmatter("---\ntools:\n---\n").tools).toBe("");
  });

  it("strips surrounding double quotes from a scalar", () => {
    expect(parse_frontmatter('---\nname: "quoted name"\n---\n').name).toBe("quoted name");
  });

  it("strips surrounding single quotes from a scalar", () => {
    expect(parse_frontmatter("---\nname: 'quoted name'\n---\n").name).toBe("quoted name");
  });

  it("keeps a quoted scalar containing commas as one string, not a list", () => {
    const fm = parse_frontmatter('---\ndescription: "data flow, scripts, and artifacts"\n---\n');
    expect(fm.description).toBe("data flow, scripts, and artifacts");
  });

  it("skips comment lines and blank lines within the block", () => {
    const fm = parse_frontmatter("---\n# a comment\nname: skill\n\ntools: Bash\n---\n");
    expect(fm).toEqual({ name: "skill", tools: "Bash" });
  });

  it("skips a malformed line that has no colon", () => {
    expect(parse_frontmatter("---\nnot a key value line\nname: skill\n---\n")).toEqual({ name: "skill" });
  });

  it("parses frontmatter delimited by CRLF line endings", () => {
    const fm = parse_frontmatter("---\r\nname: skill\r\ntools: Bash, Read\r\n---\r\nbody");
    expect(fm.name).toBe("skill");
    expect(fm.tools).toEqual(["Bash", "Read"]);
  });
});
