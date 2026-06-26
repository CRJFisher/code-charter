/**
 * task-27.1.4 AC#6 — the literal markdown-link extractor.
 *
 * Finds genuine inline markdown links `[text](target)` and reports each with its source span. Fenced
 * code blocks (``` and ~~~, including mermaid fences) and inline code spans (`` `...` ``) are excluded
 * so a link written inside a usage example or a diagram never becomes a false-positive edge
 * (task-21.2 AC#5). Reference-style links, autolinks, and links whose `[text](target)` span wraps
 * across a newline are out of scope: the skill corpus uses single-line inline links.
 */

import { format_range } from "./text_span";

export interface MarkdownLink {
  /** Link target with any `#fragment` and `"title"` stripped — the path to resolve on disk. */
  path_target: string;
  /** Provenance span of the whole `[..](..)` as `line:col-line:col`. */
  source_range: string;
}

const FENCE = /^\s*(```|~~~)/;
const LINK = /\[[^\]]*\]\(([^)]+)\)/g;

/** Mask inline-code spans with spaces rather than removing them, so column offsets stay accurate. */
function mask_inline_code(line: string): string {
  let masked = "";
  let in_code = false;
  for (const ch of line) {
    if (ch === "`") {
      in_code = !in_code;
      masked += " ";
    } else {
      masked += in_code ? " " : ch;
    }
  }
  return masked;
}

function target_path(target: string): string {
  const trimmed = target.trim();
  // A title follows the url after whitespace: `(url "title")` / `(url 'title')`.
  const url_end = trimmed.search(/\s/);
  const url = url_end === -1 ? trimmed : trimmed.slice(0, url_end);
  const hash = url.indexOf("#");
  return hash === -1 ? url : url.slice(0, hash);
}

/**
 * Parse every genuine inline markdown link in `source`. Operates on the full source so the reported
 * line numbers are absolute (what a human sees in the file), which is what click-through needs.
 */
export function parse_markdown_links(source: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const lines = source.split("\n");
  let offset = 0;
  let in_fence = false;
  for (const line of lines) {
    if (FENCE.test(line)) {
      in_fence = !in_fence;
      offset += line.length + 1;
      continue;
    }
    if (in_fence) {
      offset += line.length + 1;
      continue;
    }
    const masked = mask_inline_code(line);
    LINK.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = LINK.exec(masked)) !== null) {
      const path_target = target_path(match[1]);
      if (path_target.length === 0) continue;
      const start = offset + match.index;
      const end = start + match[0].length;
      links.push({ path_target, source_range: format_range(source, start, end) });
    }
    offset += line.length + 1;
  }
  return links;
}
