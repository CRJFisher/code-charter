/**
 * task-27.1.4 AC#6 — source-span helpers shared by the literal extractors.
 *
 * Provenance `source_range` is the string `start_line:start_col-end_line:end_col`, with 1-indexed
 * lines and 0-indexed columns, matching the convention the round-trip fixture writes (`"1:0-1:0"`).
 * These helpers turn character offsets into that form so click-through lands on the real source.
 */

export interface LineCol {
  /** 1-indexed line. */
  line: number;
  /** 0-indexed column (characters since the last newline). */
  col: number;
}

/** The {@link LineCol} of a character offset within `source`. */
export function offset_to_line_col(source: string, offset: number): LineCol {
  let line = 1;
  let last_newline = -1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === "\n") {
      line += 1;
      last_newline = i;
    }
  }
  return { line, col: offset - last_newline - 1 };
}

/** Format a half-open `[start, end)` offset span as a provenance `source_range`. */
export function format_range(source: string, start: number, end: number): string {
  const a = offset_to_line_col(source, start);
  const b = offset_to_line_col(source, end);
  return `${a.line}:${a.col}-${b.line}:${b.col}`;
}
