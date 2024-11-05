import { parseMarkdownTopSection } from "../domainContext";
import { describe, test, expect } from "vitest";

describe("parseMarkdownTopSection", () => {
  const markdown =
    '\n<!-- Edit README.md, not index.md -->\n\n# Aider is AI pair programming in your terminal\n\nAider lets you pair program with LLMs,\nto edit code in your local git repository.\nStart a new project or work with an existing git repo.\nAider works best with GPT-4o and Claude 3 Opus\nand can [connect to almost any LLM](https://aider.chat/docs/llms.html).\n\n<p align="center">\n  <img\n    src="https://aider.chat/assets/screencast.svg"\n    alt="aider screencast"\n  >\n</p>\n\n<p align="center">\n  <a href="https://discord.gg/Tv2uQnR88V">\n    <img src="https://img.shields.io/badge/Join-Discord-blue.svg"/>\n  </a>\n  <a href="https://aider.chat/docs/install.html">\n    <img src="https://img.shields.io/badge/Read-Docs-green.svg"/>\n  </a>\n</p>\n\n## Getting started\n<!--[[[cog\n# We can\'t do this here: {% include get-started.md %}\n# Because this page is rendered by GitHub as the repo README\ncog.out(open("website/_includes/get-started.md").read())\n]]]-->';

  test("should return the top section of the markdown text", () => {
    const expected = `
<!-- Edit README.md, not index.md -->

# Aider is AI pair programming in your terminal

Aider lets you pair program with LLMs,
to edit code in your local git repository.
Start a new project or work with an existing git repo.
Aider works best with GPT-4o and Claude 3 Opus
and can [connect to almost any LLM](https://aider.chat/docs/llms.html).

<p align="center">
  <img
    src="https://aider.chat/assets/screencast.svg"
    alt="aider screencast"
  >
</p>

<p align="center">
  <a href="https://discord.gg/Tv2uQnR88V">
    <img src="https://img.shields.io/badge/Join-Discord-blue.svg"/>
  </a>
  <a href="https://aider.chat/docs/install.html">
    <img src="https://img.shields.io/badge/Read-Docs-green.svg"/>
  </a>
</p>
`;
    const result = parseMarkdownTopSection(markdown);
    expect(result).toBe(expected);
  });
});
