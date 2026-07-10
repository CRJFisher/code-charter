/**
 * The description-quality floor for the stitch eval: reject a description that adds NOTHING
 * beyond the member's own name — "Handles create." for handle_create is a name-echo that teaches
 * a diagram reader nothing, yet passes a source/non-empty check. The rule is deliberately
 * high-precision/low-recall: it fires only on the zero-content degenerate case, because a
 * heuristic that false-rejects good prose becomes red noise and gets deleted. Semantic padding
 * ("handles create operations for the system") is an accepted residual — per-fixture
 * expected_description_contains goldens carry that precision instead.
 */

const STOPWORDS: ReadonlySet<string> = new Set([
  "a", "an", "the", "of", "to", "for", "and", "or", "is", "it", "its", "this", "that", "these",
  "those", "with", "from", "into", "on", "in", "by", "as", "at", "be", "are", "was", "were",
  "will", "then", "than", "but", "not", "no", "up", "out", "each", "when", "given",
]);

/** `csv_exporter.ts#CsvExporter.export_rows:method` → `export_rows`. */
export function member_name_of(symbol_path: string): string {
  const after_hash = symbol_path.includes("#") ? symbol_path.slice(symbol_path.indexOf("#") + 1) : symbol_path;
  const before_kind = after_hash.includes(":") ? after_hash.slice(0, after_hash.indexOf(":")) : after_hash;
  const dot = before_kind.lastIndexOf(".");
  return dot === -1 ? before_kind : before_kind.slice(dot + 1);
}

function split_tokens(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

/**
 * A token counts as name-derived when it matches a name token exactly, extends one as a prefix
 * (inflection: "runs" echoes "run", "handles" echoes "handle"), or shares a >=4-char prefix with
 * one ("looks" echoes "lookup") — so inflection never rescues an echo, while short accidental
 * overlaps stay content.
 */
function is_name_derived(token: string, name_tokens: readonly string[]): boolean {
  for (const name_token of name_tokens) {
    if (token === name_token || token.startsWith(name_token) || name_token.startsWith(token)) return true;
    if (token.length >= 4 && name_token.length >= 4 && token.slice(0, 4) === name_token.slice(0, 4)) return true;
  }
  return false;
}

/**
 * True when the description contributes zero content words beyond the member's own name and
 * function words — the degenerate name-echo the eval must reject.
 */
export function is_name_restatement(symbol_path: string, description: string): boolean {
  const name_tokens = split_tokens(member_name_of(symbol_path));
  const residual = split_tokens(description).filter(
    (token) => !STOPWORDS.has(token) && !is_name_derived(token, name_tokens),
  );
  return residual.length === 0;
}
