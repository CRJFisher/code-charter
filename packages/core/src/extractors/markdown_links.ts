/**
 * task-27.1.4 AC#6 — the literal markdown-link extractor.
 *
 * Finds genuine inline markdown links `[text](target)` in a document and reports each occurrence with
 * its source span. Fenced code blocks (``` and ~~~, including mermaid fences) and inline code spans
 * (`` `...` ``) are excluded, so a link written inside a usage example or a diagram never becomes a
 * false-positive edge (task-21.2 AC#5). Reference-style links, autolinks, and links whose
 * `[text](target)` span wraps across a newline are out of scope (the skill corpus uses single-line
 * inline links); these limitations are stated rather than half-supported.
 */

import { offset_to_line_col } from "./text_span";

export interface MarkdownLink {
  /** The raw target exactly as written, e.g. `scripts/x.py#anchor` (title and quotes stripped). */
  raw_target: string;
  /** `raw_target` with any `#fragment` removed — the path to resolve on disk. */
  path_target: string;
  /** The `#fragment` after the path, or null. Retained for provenance, never for resolution. */
  fragment: string | null;
  /** Provenance `source_range` of the whole `[..](..)` span: `line:col-line:col`. */
  source_range: string;
}

const FENCE = /^\s*(```|~~~)/;
const LINK = /\[[^\]]*\]\(([^)]+)\)/g;

/** Replace every inline-code span on a line with spaces, preserving column positions. */
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

/** Split a link target into its path and optional `#fragment`, dropping any `"title"`. */
function split_target(target: string): { raw_target: string; path_target: string; fragment: string | null } {
  const trimmed = target.trim();
  // A title follows the url after whitespace: `(url "title")` / `(url 'title')`.
  const space = trimmed.search(/\s/);
  const url = space === -1 ? trimmed : trimmed.slice(0, space);
  const hash = url.indexOf("#");
  if (hash === -1) {
    return { raw_target: url, path_target: url, fragment: null };
  }
  return { raw_target: url, path_target: url.slice(0, hash), fragment: url.slice(hash + 1) };
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
      const { raw_target, path_target, fragment } = split_target(match[1]);
      if (path_target.length === 0) continue;
      const start = offset + match.index;
      const end = start + match[0].length;
      const a = offset_to_line_col(source, start);
      const b = offset_to_line_col(source, end);
      links.push({
        raw_target,
        path_target,
        fragment,
        source_range: `${a.line}:${a.col}-${b.line}:${b.col}`,
      });
    }
    offset += line.length + 1;
  }
  return links;
}
