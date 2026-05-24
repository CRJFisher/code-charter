import type { AnyDefinition } from "@ariadnejs/types";

/**
 * Read ariadne's native docstring off any definition variant.
 * Some definitions (ClassDefinition) store an array of doc comments;
 * the rest store a single string.
 */
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
