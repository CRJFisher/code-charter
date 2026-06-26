import type {
  AnyDefinition,
  ConstructorDefinition,
  FunctionDefinition,
  MethodDefinition,
  ScopeId,
  SymbolId,
} from "@ariadnejs/types";

import { format_anchor } from "./anchor_string";
import { build_symbol_path, compute_content_hash } from "./code_state";
import type { ResolverSymbol } from "./resolver_symbol";

/**
 * Turns Ariadne analysis into the resolver's normalized {@link ResolverSymbol} input. Depends only on
 * Ariadne's data *shapes* (type-only), never the runtime `Project`: the caller (where `@ariadnejs/core`
 * already lives) gathers per-file `definitions` and raw `source`, and this walk produces the symbols.
 *
 * The enclosing chain is structural — a class lists its own methods/constructors — so no scope-tree
 * traversal is needed. Each symbol's body span is sliced from its `body_scope_id` (the definition's own
 * `location` points at the name, not the body). That span begins at the end of the parameter list and
 * runs through the closing brace, so a parameter-list change counts as a body change (content_hash is
 * not signature-only); the symbol's name is never inside it except via recursive self-calls.
 *
 * Scope: top-level functions and the methods/constructors of top-level classes, interfaces, and enums.
 * Namespace/module nesting, classes declared inside functions, and arrow/function-expression callables
 * bound to variables are not descended (their symbols are not anchored); extend the walk when a
 * consumer needs them. Anonymous callables (Ariadne's `<anonymous>`) are excluded outright — they have
 * no rename-stable identity, so they can neither be addressed nor distinguished in `symbol_path` space.
 */
export interface AriadneFileInput {
  /** Repo-relative, forward-slash file path — becomes the `symbol_path` prefix. */
  readonly file_path: string;
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

function take_decimal_field(field: string | undefined, scope_id: ScopeId): number {
  // Only plain decimal digits — rejects empty (`Number("")===0`), exponential, and hex coercions.
  if (field === undefined || !/^\d+$/.test(field)) {
    throw new Error(`malformed scope id (expected 4 trailing decimal range fields): ${scope_id}`);
  }
  return Number(field);
}

/**
 * Parse the trailing range out of a `ScopeId` (`type:file_path:start_line:start_col:end_line:end_col`).
 * The last four colon-fields are the numeric range; popping them is robust to colons earlier in the id
 * (a Windows path's drive-letter colon is reabsorbed into the discarded middle). The four fields are
 * validated as plain decimals; no field-count or middle-segment check is performed — the prefix and
 * path are trusted, which holds because Ariadne emits this format.
 */
export function parse_scope_range(scope_id: ScopeId): ScopeRange {
  const parts = scope_id.split(":");
  const end_col = take_decimal_field(parts.pop(), scope_id);
  const end_line = take_decimal_field(parts.pop(), scope_id);
  const start_col = take_decimal_field(parts.pop(), scope_id);
  const start_line = take_decimal_field(parts.pop(), scope_id);
  return { start_line, start_col, end_line, end_col };
}

/**
 * Slice the exact source span for a scope range. Lines are 1-indexed in Ariadne but the split array is
 * 0-indexed, so rows shift by one; columns are already 0-indexed and `end_col` is exclusive (the
 * position after the last char, matching `String.prototype.substring`).
 */
export function slice_source(lines: readonly string[], range: ScopeRange): string {
  const start_row = range.start_line - 1;
  const end_row = range.end_line - 1;
  if (start_row === end_row) {
    // Guard a degenerate range explicitly rather than relying on substring's silent argument swap.
    if (range.end_col < range.start_col) {
      return "";
    }
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

function collect_symbol(
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

/**
 * The name Ariadne stamps on an anonymous callable (its `anonymous_function_symbol` sets
 * `name: "<anonymous>"`). An unnamed callback has no rename-stable, addressable identity, so two of
 * them in one file would derive the same `<file>#<anonymous>:<kind>` `symbol_path` — a collision that
 * has no place in the resolver index. They are skipped at this single traversal seam.
 */
const ANONYMOUS_NAME = "<anonymous>";

/** Walk the top-level definitions of one file, invoking `visit` for each anchorable callable-with-a-body. */
function walk_callables(
  file: AriadneFileInput,
  visit: (def: FunctionDefinition | MethodDefinition | ConstructorDefinition, enclosing: readonly string[]) => void,
): void {
  const visit_named = (
    def: FunctionDefinition | MethodDefinition | ConstructorDefinition,
    enclosing: readonly string[],
  ): void => {
    if (def.name === ANONYMOUS_NAME) return;
    visit(def, enclosing);
  };
  for (const def of file.definitions) {
    switch (def.kind) {
      case "function":
        visit_named(def, []);
        break;
      case "class": {
        const enclosing = [def.name];
        for (const ctor of def.constructors ?? []) visit_named(ctor, enclosing);
        for (const method of def.methods) visit_named(method, enclosing);
        break;
      }
      case "interface": {
        const enclosing = [def.name];
        for (const method of def.methods) visit_named(method, enclosing);
        break;
      }
      case "enum": {
        const enclosing = [def.name];
        for (const method of def.methods ?? []) visit_named(method, enclosing);
        break;
      }
      default:
        // variables, types, imports, namespaces, properties — not anchorable callables (YAGNI).
        break;
    }
  }
}

/** Produce one {@link ResolverSymbol} per anchorable callable-with-a-body across the given files. */
export function resolver_symbols_from_ariadne(files: readonly AriadneFileInput[]): ResolverSymbol[] {
  const out: ResolverSymbol[] = [];
  for (const file of files) {
    const lines = file.source.split("\n");
    walk_callables(file, (def, enclosing) => collect_symbol(out, file.file_path, lines, def, enclosing));
  }
  return out;
}

/**
 * An anchorable callable carrying its Ariadne {@link SymbolId} alongside its derived anchor — the seam a
 * headless raw extractor needs to bridge the two id spaces in one pass. `symbol_id` is the `CallGraph`
 * node key (location-based); `symbol_path` is the resolver's rename-stable, enclosing-qualified id; the
 * two are otherwise unrelated, so callers persisting `code.calls` edges or `code.function` nodes from a
 * `CallGraph` map endpoints through {@link AnchoredSymbol.symbol_path} to join them to the resolver index.
 */
export interface AnchoredSymbol {
  /** The Ariadne `CallGraph` node key for this callable. */
  symbol_id: SymbolId;
  /** The resolver's enclosing-qualified, rename-stable id (`file#A.b:method`). */
  symbol_path: string;
  /** sha256 of the rename-stable body — the anchor's content half. */
  content_hash: string;
  /** `format_anchor(symbol_path:content_hash)` — ready to store as a `NodeRow.anchor`. */
  anchor: string;
  /** Repo-relative defining file. */
  file_path: string;
  /** The live Ariadne definition (read for its docstring + kind). */
  definition: AnyDefinition;
}

/**
 * Produce one {@link AnchoredSymbol} per anchorable callable-with-a-body, capturing each one's Ariadne
 * `SymbolId`. Same traversal and skip rules as {@link resolver_symbols_from_ariadne} (signature-only
 * members without a body are not anchorable and are omitted), plus the symbol_id↔symbol_path bridge.
 */
export function anchored_symbols_from_ariadne(files: readonly AriadneFileInput[]): AnchoredSymbol[] {
  const out: AnchoredSymbol[] = [];
  for (const file of files) {
    const lines = file.source.split("\n");
    walk_callables(file, (def, enclosing) => {
      if (!def.body_scope_id) return;
      const symbol_path = build_symbol_path(file.file_path, enclosing, def.name, def.kind);
      const content_hash = compute_content_hash(slice_source(lines, parse_scope_range(def.body_scope_id)), def.name);
      out.push({
        symbol_id: def.symbol_id,
        symbol_path,
        content_hash,
        anchor: format_anchor({ symbol_path, content_hash }),
        file_path: file.file_path,
        definition: def,
      });
    });
  }
  return out;
}
