/**
 * The `meta.json sub_agents[]` reader.
 *
 * `sub_agents[]` is the canonical registry-shaped string→symbol map: an explicit list of sub-agent
 * declarations, not arbitrary reflection. This reader parses it once and is shared by the literal
 * skill extractor (which writes raw `skill.to_subagent` edges) and the agentic registry detector
 * (which proposes `agentic.bridge` candidates). Each declaration carries the source span of its name
 * inside `meta.json` so provenance click-through lands on the real declaration.
 */

import { format_range } from "./text_span";

export interface SubAgentDecl {
  /** The declared sub-agent name (the string side of the registry map). */
  name: string;
  /** A bundle-relative file path when the entry declares one, else null. */
  file: string | null;
  /** Provenance `source_range` of the entry's name within `meta.json`. */
  source_range: string;
}

function entry_name(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (entry !== null && typeof entry === "object" && "name" in entry) {
    const name = (entry as { name: unknown }).name;
    if (typeof name === "string") return name;
  }
  return null;
}

function entry_file(entry: unknown): string | null {
  if (entry !== null && typeof entry === "object" && "file" in entry) {
    const file = (entry as { file: unknown }).file;
    if (typeof file === "string") return file;
  }
  return null;
}

/**
 * Read `sub_agents[]` from a `meta.json` source. Tolerant of an absent or non-array `sub_agents`
 * (returns `[]`) and of entries that are either bare name strings or `{ name, file }` objects. The
 * span for each entry is located by finding its name literal in the raw text after the `sub_agents`
 * key; when an entry's name cannot be located, it falls back to the `sub_agents` key span — still a
 * real position in `meta.json` (the NOT-NULL `source_range` is always satisfied).
 */
export function read_sub_agents(meta_json_source: string): SubAgentDecl[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(meta_json_source);
  } catch {
    return [];
  }
  if (parsed === null || typeof parsed !== "object" || !("sub_agents" in parsed)) return [];
  const raw_list = (parsed as { sub_agents: unknown }).sub_agents;
  if (!Array.isArray(raw_list)) return [];

  const key_offset = meta_json_source.indexOf('"sub_agents"');
  const key_range =
    key_offset === -1
      ? "1:0-1:0"
      : format_range(meta_json_source, key_offset, key_offset + '"sub_agents"'.length);
  const search_from = key_offset === -1 ? 0 : key_offset;

  const decls: SubAgentDecl[] = [];
  let cursor = search_from;
  for (const entry of raw_list) {
    const name = entry_name(entry);
    if (name === null) continue;
    const literal = `"${name}"`;
    const found = meta_json_source.indexOf(literal, cursor);
    let source_range = key_range;
    if (found !== -1) {
      source_range = format_range(meta_json_source, found, found + literal.length);
      cursor = found + literal.length;
    }
    decls.push({ name, file: entry_file(entry), source_range });
  }
  return decls;
}
