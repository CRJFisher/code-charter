import type { DocstringProvider, DocstringInfo } from "@code-charter/types";
import { strip_jsdoc_tags } from "./jsdoc_tag_stripper";

interface ClassRange {
  name: string;
  start: number;
  end: number;
}

const DECLARATION_PATTERNS: RegExp[] = [
  // function declarations: [export [default]] [async] function name
  /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)/,
  // class declarations: [export [default]] [abstract] class Name
  /^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+(\w+)/,
  // interface declarations: [export] interface Name
  /^(?:export\s+)?interface\s+(\w+)/,
  // type declarations: [export] type Name
  /^(?:export\s+)?type\s+(\w+)\s*[=<]/,
  // const/let arrow functions or function expressions: [export] const name = ...
  /^(?:export\s+)?(?:const|let)\s+(\w+)\s*(?::\s*[^=]+?)?\s*=/,
  // class methods: [modifiers] [async] [get/set] name(
  /^\s*(?:(?:public|private|protected|static|abstract|override|readonly)\s+)*(?:async\s+)?(?:get\s+|set\s+)?(\w+)\s*(?:<[^>]*>)?\s*\(/,
];

export class RegexDocstringProvider implements DocstringProvider {
  get_docstrings(file_path: string, content: string): Map<string, DocstringInfo> {
    const result = new Map<string, DocstringInfo>();
    const lines = content.split('\n');
    const class_ranges = this.find_class_ranges(lines);
    const jsdoc_blocks = this.find_jsdoc_blocks(content, lines);

    for (const block of jsdoc_blocks) {
      const declaration = this.find_declaration_after(lines, block.end_line);
      if (!declaration) continue;

      const class_context = this.get_class_context(declaration.line_index, class_ranges);
      const qualified_name = class_context
        ? `${class_context}.${declaration.name}`
        : declaration.name;

      const body = strip_jsdoc_tags(block.raw);
      if (!body) continue;

      result.set(qualified_name, {
        symbol_name: qualified_name,
        raw: block.raw,
        body,
        line: block.start_line,
      });
    }

    return result;
  }

  private find_jsdoc_blocks(
    content: string,
    lines: string[]
  ): Array<{ raw: string; start_line: number; end_line: number }> {
    const blocks: Array<{ raw: string; start_line: number; end_line: number }> = [];
    const pattern = /\/\*\*[\s\S]*?\*\//g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      const raw = match[0];
      // Don't match plain block comments that aren't JSDoc
      if (!raw.startsWith('/**')) continue;

      const start_offset = match.index;
      const end_offset = start_offset + raw.length;

      const start_line = content.substring(0, start_offset).split('\n').length;
      const end_line = content.substring(0, end_offset).split('\n').length;

      blocks.push({ raw, start_line, end_line });
    }

    return blocks;
  }

  private find_declaration_after(
    lines: string[],
    jsdoc_end_line: number
  ): { name: string; line_index: number } | null {
    // Search up to 5 lines after the JSDoc comment (to skip decorators, blank lines)
    for (let i = jsdoc_end_line; i < Math.min(jsdoc_end_line + 5, lines.length); i++) {
      const line = lines[i].trim();
      if (line === '') continue;
      if (line.startsWith('@') && !line.startsWith('@param') && !line.startsWith('@returns')) {
        // Decorator line — skip
        continue;
      }

      for (const pattern of DECLARATION_PATTERNS) {
        const match = line.match(pattern);
        if (match && match[1]) {
          // Skip constructor, get, set as standalone entries (they belong to their class)
          if (['constructor'].includes(match[1])) continue;
          return { name: match[1], line_index: i };
        }
      }

      // If we hit a non-blank, non-decorator line that doesn't match any pattern, stop
      break;
    }

    return null;
  }

  private find_class_ranges(lines: string[]): ClassRange[] {
    const ranges: ClassRange[] = [];
    const class_pattern = /^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+(\w+)/;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].trim().match(class_pattern);
      if (!match) continue;

      const name = match[1];
      const open_brace = this.find_open_brace(lines, i);
      if (open_brace === -1) continue;

      const close_brace = this.find_matching_close_brace(lines, open_brace);
      ranges.push({ name, start: open_brace, end: close_brace });
    }

    return ranges;
  }

  private find_open_brace(lines: string[], start: number): number {
    for (let i = start; i < Math.min(start + 5, lines.length); i++) {
      if (lines[i].includes('{')) return i;
    }
    return -1;
  }

  private find_matching_close_brace(lines: string[], open_line: number): number {
    let depth = 0;
    let found_open = false;
    for (let i = open_line; i < lines.length; i++) {
      for (const char of lines[i]) {
        if (char === '{') { depth++; found_open = true; }
        if (char === '}') depth--;
        if (found_open && depth === 0) return i;
      }
    }
    return lines.length - 1;
  }

  private get_class_context(line_index: number, class_ranges: ClassRange[]): string | null {
    for (const range of class_ranges) {
      if (line_index > range.start && line_index < range.end) {
        return range.name;
      }
    }
    return null;
  }
}
