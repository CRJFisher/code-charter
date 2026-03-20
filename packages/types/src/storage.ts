/**
 * Primary artifact: cluster summaries committed to git.
 */
export interface ClusterSummariesFile {
  content_hash: string;
  source_hash: string;
  generated_at: string;
  clusters: ClusterSummaryEntry[];
}

export interface ClusterSummaryEntry {
  cluster_id: number;
  label: string;
  description: string;
  members: string[];
  depends_on: number[];
  depended_on_by: number[];
}

/**
 * Cache file: embeddings + cluster assignments (gitignored).
 */
export interface CacheFile {
  content_hash: string;
  embedding_provider: string;
  embeddings: Record<string, number[]>;
  cluster_assignments: number[];
  symbols: string[];
}

/**
 * Docstring extraction types.
 */
export interface DocstringInfo {
  symbol_name: string;
  raw: string;
  body: string;
  line: number;
}

export interface DocstringProvider {
  get_docstrings(file_path: string, content: string): Map<string, DocstringInfo>;
}
