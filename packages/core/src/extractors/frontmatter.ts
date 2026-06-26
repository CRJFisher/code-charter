/**
 * task-27.1.4 AC#6 — a tolerant YAML-frontmatter parser for skill docs.
 *
 * Skill frontmatter is the leading `---`-delimited block of a SKILL.md. It is surfaced as node
 * attributes, never as separate nodes (task-21.2 AC#4). This is a deliberately small hand-rolled
 * parser, not a full YAML engine: the repo has no YAML dependency, and skill frontmatter only uses a
 * handful of shapes (scalars, inline lists, block lists, block scalars). It normalizes the two
 * documented key aliases — `allowed-tools` → `tools`, `user-invocable` → `user_invocable` — and folds
 * any other hyphenated key to snake_case, so a consumer reads one stable attribute name regardless of
 * which spelling the author used.
 */

const ALIASES: Record<string, string> = {
  "allowed-tools": "tools",
  allowed_tools: "tools",
  "user-invocable": "user_invocable",
};

function normalize_key(key: string): string {
  const trimmed = key.trim();
  return ALIASES[trimmed] ?? trimmed.replace(/-/g, "_");
}

function is_quoted(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  return (first === '"' && last === '"') || (first === "'" && last === "'");
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return is_quoted(trimmed) ? trimmed.slice(1, -1) : trimmed;
}

function coerce_scalar(value: string): unknown {
  const v = unquote(value);
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

function parse_inline_list(value: string): string[] {
  return value
    .split(",")
    .map((part) => unquote(part))
    .filter((part) => part.length > 0);
}

function indent_of(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * Parse the leading frontmatter block of `source` into a normalized attribute bag. Returns `{}` when
 * there is no frontmatter. Malformed lines are skipped rather than thrown — frontmatter is best-effort
 * metadata, not a load-bearing contract.
 */
export function parse_frontmatter(source: string): Record<string, unknown> {
  const normalized = source.replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) return {};
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) return {};
  const block = normalized.slice(4, end + 1);
  const lines = block.split("\n");

  const attributes: Record<string, unknown> = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0 || line.trimStart().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon === -1 || indent_of(line) > 0) continue; // indented/colon-less lines belong to a block value handled by its key's branch below
    const key = normalize_key(line.slice(0, colon));
    const rest = line.slice(colon + 1).trim();
    const base_indent = indent_of(line);

    if (rest === "|" || rest === ">") {
      const collected: string[] = [];
      while (i + 1 < lines.length && (lines[i + 1].trim().length === 0 || indent_of(lines[i + 1]) > base_indent)) {
        i += 1;
        collected.push(lines[i].trim());
      }
      attributes[key] = collected.join(rest === ">" ? " " : "\n").trim();
      continue;
    }

    if (rest === "") {
      // An empty value is ambiguous: it may head a YAML block list of `- item` lines, or be a genuinely empty scalar.
      const items: string[] = [];
      while (i + 1 < lines.length && lines[i + 1].trimStart().startsWith("- ")) {
        i += 1;
        items.push(unquote(lines[i].trimStart().slice(2)));
      }
      attributes[key] = items.length > 0 ? items : "";
      continue;
    }

    // A quoted value is always a single scalar (a description may contain commas); only an unquoted
    // comma-bearing value is an inline list.
    attributes[key] = !is_quoted(rest) && rest.includes(",") ? parse_inline_list(rest) : coerce_scalar(rest);
  }
  return attributes;
}
