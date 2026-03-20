/**
 * Word-frequency based cluster summary generation.
 * Produces human-readable cluster descriptions without requiring an LLM.
 */

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "because", "but", "and", "or", "if", "while", "this", "that",
  "these", "those", "it", "its", "i", "me", "my", "we", "our", "you",
  "your", "he", "him", "his", "she", "her", "they", "them", "their",
  "what", "which", "who", "whom", "whose", "when", "where",
  "function", "method", "class", "returns", "return", "param", "type",
  "string", "number", "boolean", "object", "array", "null", "undefined",
  "void", "any", "get", "set", "new", "given", "based", "using", "used",
  "also", "e", "g", "etc", "ie",
]);

/**
 * Tokenize a text into lowercase words, splitting on non-alphanumeric characters
 * and camelCase / PascalCase boundaries.
 */
function tokenize(text: string): string[] {
  // Split camelCase and PascalCase
  const expanded = text.replace(/([a-z])([A-Z])/g, "$1 $2")
                       .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  // Split on non-alphanumeric
  return expanded
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Compute term frequency for a list of tokens.
 */
function compute_term_frequency(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  return freq;
}

export interface ClusterSummary {
  cluster_index: number;
  description: string;
  top_terms: string[];
}

/**
 * Generate heuristic summaries for each cluster based on word frequency
 * of member docstrings. Picks the top distinctive terms per cluster.
 */
export function generate_cluster_summaries(
  clusters: string[][],
  docstrings: Record<string, string>,
  max_terms: number = 5
): ClusterSummary[] {
  // Build global term frequency across all clusters
  const global_freq = new Map<string, number>();
  const all_tokens: string[] = [];

  for (const cluster of clusters) {
    for (const symbol of cluster) {
      const text = docstrings[symbol] || symbol;
      const tokens = tokenize(text);
      all_tokens.push(...tokens);
    }
  }

  for (const token of all_tokens) {
    global_freq.set(token, (global_freq.get(token) || 0) + 1);
  }

  const total_tokens = all_tokens.length;

  // For each cluster, find distinctive terms (high local frequency, low global frequency)
  const summaries: ClusterSummary[] = [];

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    const cluster_tokens: string[] = [];

    for (const symbol of cluster) {
      const text = docstrings[symbol] || symbol;
      cluster_tokens.push(...tokenize(text));
    }

    const local_freq = compute_term_frequency(cluster_tokens);
    const cluster_token_count = cluster_tokens.length;

    // Score terms by TF-IDF-like distinctiveness
    const scored_terms: Array<{ term: string; score: number }> = [];
    for (const [term, count] of local_freq.entries()) {
      const local_tf = count / Math.max(cluster_token_count, 1);
      const global_tf = (global_freq.get(term) || 1) / Math.max(total_tokens, 1);
      // Distinctiveness: how much more frequent in this cluster vs globally
      const score = local_tf / Math.max(global_tf, 0.001);
      scored_terms.push({ term, score });
    }

    scored_terms.sort((a, b) => b.score - a.score);
    const top_terms = scored_terms.slice(0, max_terms).map((t) => t.term);

    const description = top_terms.length > 0
      ? `Functions related to: ${top_terms.join(", ")}`
      : `Cluster ${i} (${cluster.length} members)`;

    summaries.push({
      cluster_index: i,
      description,
      top_terms,
    });
  }

  return summaries;
}
