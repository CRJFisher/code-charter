import type { AnyDefinition } from "@ariadnejs/types";

// ClassDefinition stores docstrings as an array of doc comments; every other
// definition variant stores a single string, so both shapes are handled.
export function get_docstring(definition: AnyDefinition): string | undefined {
  if (!("docstring" in definition)) return undefined;
  const value = definition.docstring;
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  if (Array.isArray(value)) {
    const joined = value.join("\n\n").trim();
    return joined || undefined;
  }
  return undefined;
}
