import { parse_markdown_links } from "./markdown_links";

describe("parse_markdown_links (task-21.2 AC#5 — no false positives)", () => {
  it("extracts a genuine inline link with its source range", () => {
    const source = "See [the script](scripts/sync.py) for details.";
    const links = parse_markdown_links(source);
    expect(links).toHaveLength(1);
    expect(links[0].path_target).toBe("scripts/sync.py");
    expect(links[0].raw_target).toBe("scripts/sync.py");
    expect(links[0].fragment).toBeNull();
    expect(links[0].source_range).toBe("1:4-1:33");
  });

  it("splits a #fragment off the path target", () => {
    const [link] = parse_markdown_links("[x](references/a.md#section)");
    expect(link.path_target).toBe("references/a.md");
    expect(link.fragment).toBe("section");
  });

  it("drops a (url \"title\") title, keeping the url", () => {
    const [link] = parse_markdown_links('[x](scripts/a.py "the title")');
    expect(link.path_target).toBe("scripts/a.py");
  });

  it("ignores links inside a fenced code block", () => {
    const source = ["```bash", "[fake](scripts/x.py)", "```", "[real](scripts/y.py)"].join("\n");
    const links = parse_markdown_links(source);
    expect(links.map((l) => l.path_target)).toEqual(["scripts/y.py"]);
    expect(links[0].source_range.startsWith("4:")).toBe(true);
  });

  it("ignores links inside a mermaid fence and inline code spans", () => {
    const source = ["```mermaid", "[a](b.md)", "```", "before `[also fake](y.md)` after [real](z.md)"].join("\n");
    expect(parse_markdown_links(source).map((l) => l.path_target)).toEqual(["z.md"]);
  });

  it("reports absolute line numbers across multiple lines", () => {
    const source = ["line one", "line two [t](a.md) end"].join("\n");
    const [link] = parse_markdown_links(source);
    expect(link.source_range).toBe("2:9-2:18");
  });

  it("returns nothing for prose with no real links", () => {
    expect(parse_markdown_links("just some prose mentioning scripts/x.py by name")).toEqual([]);
  });
});
