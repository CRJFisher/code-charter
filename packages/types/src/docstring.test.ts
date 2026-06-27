import type { FilePath, SymbolId, SymbolName } from "@ariadnejs/types";
import type { ScopeId } from "@ariadnejs/types/dist/scopes";
import type {
  ClassDefinition,
  FunctionDefinition,
  PropertyDefinition,
} from "@ariadnejs/types/dist/symbol_definitions";

import { get_docstring } from "./docstring";

const location = {
  file_path: "a.ts" as FilePath,
  start_line: 1,
  start_column: 0,
  end_line: 2,
  end_column: 0,
};

function make_function(docstring?: string): FunctionDefinition {
  return {
    kind: "function",
    symbol_id: "fn" as SymbolId,
    name: "fn" as SymbolName,
    defining_scope_id: "scope:0" as ScopeId,
    location,
    is_exported: false,
    signature: { parameters: [] },
    body_scope_id: "scope:1" as ScopeId,
    docstring,
  };
}

function make_class(docstring?: readonly string[]): ClassDefinition {
  return {
    kind: "class",
    symbol_id: "cls" as SymbolId,
    name: "cls" as SymbolName,
    defining_scope_id: "scope:0" as ScopeId,
    location,
    is_exported: false,
    extends: [],
    methods: [],
    properties: [],
    decorators: [],
    docstring,
  };
}

const property_without_docstring: PropertyDefinition = {
  kind: "property",
  symbol_id: "prop" as SymbolId,
  name: "prop" as SymbolName,
  defining_scope_id: "scope:0" as ScopeId,
  location,
  decorators: [],
};

describe("get_docstring", () => {
  it("returns undefined for a definition variant that has no docstring field", () => {
    expect(get_docstring(property_without_docstring)).toBeUndefined();
  });

  it("returns undefined when the docstring is explicitly undefined", () => {
    expect(get_docstring(make_function(undefined))).toBeUndefined();
  });

  it("trims a single-string docstring", () => {
    expect(get_docstring(make_function("  hello world  "))).toBe("hello world");
  });

  it("treats a whitespace-only string docstring as absent", () => {
    expect(get_docstring(make_function("   \n  "))).toBeUndefined();
  });

  it("joins an array of doc comments with blank lines", () => {
    expect(get_docstring(make_class(["first", "second"]))).toBe("first\n\nsecond");
  });

  it("trims the joined result of an array docstring", () => {
    expect(get_docstring(make_class(["  first  ", "  second  "]))).toBe(
      "first  \n\n  second",
    );
  });

  it("treats an empty docstring array as absent", () => {
    expect(get_docstring(make_class([]))).toBeUndefined();
  });

  it("treats a whitespace-only array docstring as absent", () => {
    expect(get_docstring(make_class(["   ", "  "]))).toBeUndefined();
  });
});
