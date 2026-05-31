import type {
  AnyDefinition,
  ConstructorDefinition,
  FunctionDefinition,
  MethodDefinition,
  ScopeId,
} from "@ariadnejs/types";

import type { ResolverSymbol } from "./resolver_symbol";

/**
 * Turns Ariadne analysis into the resolver's normalized {@link ResolverSymbol} input. Depends only on
 * Ariadne's data *shapes* (type-only), never the runtime `Project`: the caller (where `@ariadnejs/core`
 * already lives) gathers per-file `definitions` and raw `source`, and this walk produces the symbols.
 *
 * The enclosing chain is structural — a class lists its own methods/constructors — so no scope-tree
 * traversal is needed. Each symbol's body span is sliced from its `body_scope_id` (the definition's own
 * `location` points at the name, not the body).
 */
export interface AriadneFileInput {
  /** Repo-relative, forward-slash file path — becomes the `symbol_path` prefix. */
  readonly file_path: string;
  /** The file's full source text. */
  readonly source: string;
  /**
   * The file's top-level definitions (functions, classes, interfaces, enums) from a `SemanticIndex`.
   * Nested methods/constructors are reached structurally and must NOT be passed here.
   */
  readonly definitions: readonly AnyDefinition[];
}

interface ScopeRange {
  /** 1-indexed line. */
  readonly start_line: number;
  /** 0-indexed column. */
  readonly start_col: number;
  readonly end_line: number;
  readonly end_col: number;
}

/**
 * Parse the trailing range out of a `ScopeId` (`type:file_path:start_line:start_col:end_line:end_col`).
 * The last four colon-fields are the numeric range; popping them is robust to colons earlier in the id.
 * (A Windows path's drive-letter colon is reabsorbed into the discarded middle; a path segment that is
 * itself purely numeric is the one pathological case — Ariadne controls this format, so it does not arise.)
 */
export function parse_scope_range(scope_id: ScopeId): ScopeRange {
  const parts = scope_id.split(":");
  const end_col = Number(parts.pop());
  const end_line = Number(parts.pop());
  const start_col = Number(parts.pop());
  const start_line = Number(parts.pop());
  if (![start_line, start_col, end_line, end_col].every(Number.isInteger)) {
    throw new Error(`malformed scope id (expected 4 trailing numeric fields): ${scope_id}`);
  }
  return { start_line, start_col, end_line, end_col };
}

/**
 * Slice the exact source span for a scope range. Lines are 1-indexed in Ariadne but the split array is
 * 0-indexed, so rows shift by one; columns are already 0-indexed.
 */
export function slice_source(lines: readonly string[], range: ScopeRange): string {
  const start_row = range.start_line - 1;
  const end_row = range.end_line - 1;
  if (start_row === end_row) {
    return lines[start_row]?.substring(range.start_col, range.end_col) ?? "";
  }
  const out: string[] = [];
  for (let i = start_row; i <= end_row && i < lines.length; i++) {
    if (i === start_row) {
      out.push(lines[i]?.substring(range.start_col) ?? "");
    } else if (i === end_row) {
      out.push(lines[i]?.substring(0, range.end_col) ?? "");
    } else {
      out.push(lines[i] ?? "");
    }
  }
  return out.join("\n");
}

function emit(
  out: ResolverSymbol[],
  file_path: string,
  lines: readonly string[],
  def: FunctionDefinition | MethodDefinition | ConstructorDefinition,
  enclosing: readonly string[],
): void {
  // Signature-only methods (interface/abstract) have no body to hash — not anchorable, skip.
  if (!def.body_scope_id) {
    return;
  }
  out.push({
    file_path,
    name: def.name,
    kind: def.kind,
    enclosing,
    body_source: slice_source(lines, parse_scope_range(def.body_scope_id)),
  });
}

/** Produce one {@link ResolverSymbol} per anchorable callable-with-a-body across the given files. */
export function resolver_symbols_from_ariadne(files: readonly AriadneFileInput[]): ResolverSymbol[] {
  const out: ResolverSymbol[] = [];
  for (const file of files) {
    const lines = file.source.split("\n");
    for (const def of file.definitions) {
      switch (def.kind) {
        case "function":
          emit(out, file.file_path, lines, def, []);
          break;
        case "class": {
          const enclosing = [def.name];
          for (const ctor of def.constructors ?? []) {
            emit(out, file.file_path, lines, ctor, enclosing);
          }
          for (const method of def.methods) {
            emit(out, file.file_path, lines, method, enclosing);
          }
          break;
        }
        case "interface": {
          const enclosing = [def.name];
          for (const method of def.methods) {
            emit(out, file.file_path, lines, method, enclosing);
          }
          break;
        }
        case "enum": {
          const enclosing = [def.name];
          for (const method of def.methods ?? []) {
            emit(out, file.file_path, lines, method, enclosing);
          }
          break;
        }
        default:
          // variables, types, imports, namespaces, properties — not anchorable callables (YAGNI).
          break;
      }
    }
  }
  return out;
}
