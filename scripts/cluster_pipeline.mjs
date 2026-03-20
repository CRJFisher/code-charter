#!/usr/bin/env node

/**
 * Standalone clustering pipeline for code-charter.
 *
 * Scans the project, builds a call graph via @ariadnejs/core, extracts
 * docstrings, generates local embeddings, runs spectral clustering, and
 * outputs a JSON manifest to stdout that the update-cluster-summaries
 * skill consumes.
 *
 * Usage:
 *   node scripts/cluster_pipeline.mjs [project_dir]
 *
 * If project_dir is omitted the current working directory is used.
 */

import { Project } from "@ariadnejs/core";
import { pipeline as hf_pipeline } from "@huggingface/transformers";
import { findOptimalClusters } from "clustering-tfjs";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "__pycache__",
  ".vscode",
  "dist",
  "out",
  "build",
  ".next",
  ".cache",
  ".code-charter",
]);

const SUPPORTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".rs",
  ".go",
]);

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Recursively collect source file paths, skipping ignored directories.
 */
function collect_source_files(dir) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const full_path = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }
      results.push(...collect_source_files(full_path));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        results.push(full_path);
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Docstring extraction (regex-based, mirrors RegexDocstringProvider)
// ---------------------------------------------------------------------------

const DECLARATION_PATTERNS = [
  /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)/,
  /^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+(\w+)/,
  /^(?:export\s+)?interface\s+(\w+)/,
  /^(?:export\s+)?type\s+(\w+)\s*[=<]/,
  /^(?:export\s+)?(?:const|let)\s+(\w+)\s*(?::\s*[^=]+?)?\s*=/,
  /^\s*(?:(?:public|private|protected|static|abstract|override|readonly)\s+)*(?:async\s+)?(?:get\s+|set\s+)?(\w+)\s*(?:<[^>]*>)?\s*\(/,
];

function strip_jsdoc_tags(raw) {
  const cleaned = raw
    .replace(/^\/\*\*\s*/, "")
    .replace(/\s*\*\/$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, ""))
    .join("\n")
    .trim();

  const lines = cleaned.split("\n");
  const body_lines = [];
  for (const line of lines) {
    if (/^\s*@\w+/.test(line)) break;
    body_lines.push(line);
  }
  return body_lines.join("\n").trim();
}

function find_class_ranges(lines) {
  const ranges = [];
  const class_pattern =
    /^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+(\w+)/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].trim().match(class_pattern);
    if (!match) continue;

    const name = match[1];
    let open_brace = -1;
    for (let j = i; j < Math.min(i + 5, lines.length); j++) {
      if (lines[j].includes("{")) {
        open_brace = j;
        break;
      }
    }
    if (open_brace === -1) continue;

    let depth = 0;
    let close_brace = lines.length - 1;
    for (let j = open_brace; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === "{") depth++;
        if (ch === "}") depth--;
        if (depth === 0) {
          close_brace = j;
          break;
        }
      }
      if (depth === 0) break;
    }

    ranges.push({ name, start: open_brace, end: close_brace });
  }

  return ranges;
}

function get_class_context(line_index, class_ranges) {
  for (const range of class_ranges) {
    if (line_index > range.start && line_index < range.end) {
      return range.name;
    }
  }
  return null;
}

/**
 * Extract docstrings from file content using regex matching.
 */
function extract_docstrings_from_content(content) {
  const result = new Map();
  const lines = content.split("\n");
  const class_ranges = find_class_ranges(lines);

  const jsdoc_pattern = /\/\*\*[\s\S]*?\*\//g;
  let jsdoc_match;

  while ((jsdoc_match = jsdoc_pattern.exec(content)) !== null) {
    const raw = jsdoc_match[0];
    if (!raw.startsWith("/**")) continue;

    const end_offset = jsdoc_match.index + raw.length;
    const end_line = content.substring(0, end_offset).split("\n").length;
    const start_line = content.substring(0, jsdoc_match.index).split("\n").length;

    // Find declaration after JSDoc
    let declaration = null;
    for (let i = end_line; i < Math.min(end_line + 5, lines.length); i++) {
      const line = lines[i].trim();
      if (line === "") continue;
      if (line.startsWith("@") && !line.startsWith("@param") && !line.startsWith("@returns")) {
        continue;
      }

      for (const pat of DECLARATION_PATTERNS) {
        const m = line.match(pat);
        if (m && m[1]) {
          if (m[1] === "constructor") continue;
          declaration = { name: m[1], line_index: i };
          break;
        }
      }
      break;
    }

    if (!declaration) continue;

    const class_ctx = get_class_context(declaration.line_index, class_ranges);
    const qualified_name = class_ctx
      ? `${class_ctx}.${declaration.name}`
      : declaration.name;

    const body = strip_jsdoc_tags(raw);
    if (!body) continue;

    result.set(qualified_name, {
      symbol_name: qualified_name,
      raw,
      body,
      line: start_line,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Embeddings (local, @huggingface/transformers)
// ---------------------------------------------------------------------------

function get_model_cache_dir() {
  const home_dir = os.homedir();
  let cache_base;

  if (process.platform === "win32") {
    cache_base =
      process.env.LOCALAPPDATA || path.join(home_dir, "AppData", "Local");
  } else if (process.platform === "darwin") {
    cache_base = path.join(home_dir, "Library", "Caches");
  } else {
    cache_base = process.env.XDG_CACHE_HOME || path.join(home_dir, ".cache");
  }

  const cache_dir = path.join(cache_base, "code-charter-models");
  fs.mkdirSync(cache_dir, { recursive: true });
  return cache_dir;
}

let _embeddings_pipeline = null;

async function get_embeddings_pipeline() {
  if (_embeddings_pipeline) return _embeddings_pipeline;

  const cache_dir = get_model_cache_dir();
  process.env.TRANSFORMERS_CACHE = cache_dir;

  log_stderr("Loading embeddings model (may take a moment on first run)...");
  _embeddings_pipeline = await hf_pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2"
  );
  log_stderr("Embeddings model loaded.");
  return _embeddings_pipeline;
}

async function compute_embeddings(texts) {
  const pipe = await get_embeddings_pipeline();
  const batch_size = 32;
  const all_embeddings = [];

  for (let i = 0; i < texts.length; i += batch_size) {
    const batch = texts.slice(i, Math.min(i + batch_size, texts.length));
    const output = await pipe(batch, { pooling: "mean", normalize: true });
    const embeddings = await output.tolist();
    all_embeddings.push(...embeddings);
  }

  return all_embeddings;
}

// ---------------------------------------------------------------------------
// Embedding cache (.code-charter/cache.json)
// ---------------------------------------------------------------------------

function read_embedding_cache(cache_path) {
  try {
    const data = fs.readFileSync(cache_path, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function write_embedding_cache(cache_path, cache_data) {
  const dir = path.dirname(cache_path);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cache_path, JSON.stringify(cache_data), "utf-8");
}

/**
 * Get embeddings, using cache when possible.
 * Returns { embeddings_map, symbols, all_embeddings }.
 */
async function get_or_compute_embeddings(
  docstrings,
  content_hash,
  cache_path
) {
  const symbols = Object.keys(docstrings);
  const texts = Object.values(docstrings);
  const cache = read_embedding_cache(cache_path);

  // If cache has same content_hash, reuse embeddings
  if (cache && cache.content_hash === content_hash && cache.embeddings) {
    const all_cached = symbols.every((s) => s in cache.embeddings);
    if (all_cached) {
      log_stderr("Using cached embeddings.");
      const embeddings_map = {};
      const all_embeddings = [];
      for (const sym of symbols) {
        embeddings_map[sym] = cache.embeddings[sym];
        all_embeddings.push(cache.embeddings[sym]);
      }
      return { embeddings_map, symbols, all_embeddings };
    }
  }

  log_stderr(`Computing embeddings for ${symbols.length} symbols...`);
  const all_embeddings = await compute_embeddings(texts);

  const embeddings_map = {};
  symbols.forEach((sym, idx) => {
    embeddings_map[sym] = all_embeddings[idx];
  });

  // Write updated cache
  const cache_data = {
    content_hash,
    embedding_provider: "local:all-MiniLM-L6-v2",
    embeddings: embeddings_map,
    cluster_assignments: [],
    symbols,
  };
  write_embedding_cache(cache_path, cache_data);

  return { embeddings_map, symbols, all_embeddings };
}

// ---------------------------------------------------------------------------
// Clustering helpers
// ---------------------------------------------------------------------------

function cosine_similarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function build_similarity_matrix(embeddings_map, func_to_index, n) {
  const matrix = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));
  const func_names = Object.keys(func_to_index);

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1.0;
      } else {
        const sim = cosine_similarity(
          embeddings_map[func_names[i]],
          embeddings_map[func_names[j]]
        );
        matrix[i][j] = sim;
        matrix[j][i] = sim;
      }
    }
  }
  return matrix;
}

function build_combined_matrix(call_tree, func_to_index, sim_matrix, n) {
  const adj = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));

  for (const [symbol, node] of Object.entries(call_tree)) {
    const i = func_to_index[symbol];
    if (i === undefined) continue;

    for (const call of node.calls) {
      const j = func_to_index[call.symbol];
      if (j !== undefined && i !== j) {
        adj[i][j] = 1;
        adj[j][i] = 1;
      }
    }
  }

  const combined = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      combined[i][j] = 0.5 * sim_matrix[i][j] + 0.5 * adj[i][j];
    }
  }
  return combined;
}

function euclidean_distance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

function order_clusters_by_centroid(clusters, embeddings_map) {
  const scored = clusters.map((cluster) => {
    const dim = embeddings_map[cluster[0]].length;
    const centroid = Array(dim).fill(0);
    for (const func of cluster) {
      const emb = embeddings_map[func];
      for (let i = 0; i < dim; i++) {
        centroid[i] += emb[i];
      }
    }
    for (let i = 0; i < dim; i++) {
      centroid[i] /= cluster.length;
    }
    let total_dist = 0;
    for (const func of cluster) {
      total_dist += euclidean_distance(embeddings_map[func], centroid);
    }
    return { cluster, distance: total_dist / cluster.length };
  });
  scored.sort((a, b) => a.distance - b.distance);
  return scored.map((s) => s.cluster);
}

async function run_clustering(docstrings, call_tree, embeddings_map) {
  const func_names = Object.keys(docstrings);
  const n = func_names.length;

  if (n < 3) {
    return [func_names];
  }

  const func_to_index = {};
  const index_to_func = {};
  func_names.forEach((name, idx) => {
    func_to_index[name] = idx;
    index_to_func[idx] = name;
  });

  const sim_matrix = build_similarity_matrix(embeddings_map, func_to_index, n);
  const combined = build_combined_matrix(
    call_tree,
    func_to_index,
    sim_matrix,
    n
  );

  const result = await findOptimalClusters(combined, {
    maxClusters: Math.min(Math.floor(n / 3), 12),
    algorithm: "spectral",
    algorithmParams: { affinity: "nearest_neighbors" },
    metrics: ["silhouette", "calinskiHarabasz"],
    scoringFunction: (evaluation) => {
      const silhouette = evaluation.silhouette || 0;
      const calinski_harabasz = evaluation.calinskiHarabasz || 0;
      return silhouette * 2 + calinski_harabasz;
    },
  });

  // Group by label
  const groups = {};
  result.labels.forEach((label, idx) => {
    if (!groups[label]) groups[label] = [];
    groups[label].push(index_to_func[idx]);
  });

  const grouped = Object.values(groups);
  return order_clusters_by_centroid(grouped, embeddings_map);
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

function compute_content_hash(docstrings, call_tree) {
  const sorted_docstrings = Object.keys(docstrings)
    .sort()
    .map((k) => [k, docstrings[k]]);

  const sorted_edges = Object.keys(call_tree)
    .sort()
    .map((k) => [k, call_tree[k].calls.map((c) => c.symbol).sort()]);

  const canonical = JSON.stringify({
    docstrings: sorted_docstrings,
    edges: sorted_edges,
  });
  return crypto
    .createHash("sha256")
    .update(canonical)
    .digest("hex")
    .substring(0, 16);
}

function compute_source_hash(file_contents) {
  const hash = crypto.createHash("sha256");
  const sorted_keys = Array.from(file_contents.keys()).sort();
  for (const key of sorted_keys) {
    hash.update(key);
    hash.update(file_contents.get(key));
  }
  return hash.digest("hex").substring(0, 16);
}

// ---------------------------------------------------------------------------
// Cluster dependencies
// ---------------------------------------------------------------------------

function build_cluster_dependencies(clusters, call_tree) {
  const symbol_to_cluster = new Map();
  for (let i = 0; i < clusters.length; i++) {
    for (const sym of clusters[i]) {
      symbol_to_cluster.set(sym, i);
    }
  }

  const depends_on = new Map();
  const depended_on_by = new Map();

  for (let i = 0; i < clusters.length; i++) {
    depends_on.set(i, new Set());
    depended_on_by.set(i, new Set());
  }

  for (const [symbol, node] of Object.entries(call_tree)) {
    const src = symbol_to_cluster.get(symbol);
    if (src === undefined) continue;

    for (const call of node.calls) {
      const tgt = symbol_to_cluster.get(call.symbol);
      if (tgt !== undefined && tgt !== src) {
        depends_on.get(src).add(tgt);
        depended_on_by.get(tgt).add(src);
      }
    }
  }

  return { depends_on, depended_on_by };
}

// ---------------------------------------------------------------------------
// Heuristic label generation (TF-IDF-like)
// ---------------------------------------------------------------------------

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
  "what", "which", "who", "whom", "whose",
  "function", "method", "class", "returns", "return", "param", "type",
  "string", "number", "boolean", "object", "array", "null", "undefined",
  "void", "any", "get", "set", "new", "given", "based", "using", "used",
  "also", "e", "g", "etc", "ie",
]);

function tokenize(text) {
  const expanded = text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return expanded
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function generate_cluster_label(cluster, docstrings, global_freq, total_tokens) {
  const cluster_tokens = [];
  for (const sym of cluster) {
    cluster_tokens.push(...tokenize(docstrings[sym] || sym));
  }

  const local_freq = new Map();
  for (const tok of cluster_tokens) {
    local_freq.set(tok, (local_freq.get(tok) || 0) + 1);
  }

  const scored = [];
  for (const [term, count] of local_freq) {
    const local_tf = count / Math.max(cluster_tokens.length, 1);
    const global_tf =
      (global_freq.get(term) || 1) / Math.max(total_tokens, 1);
    scored.push({ term, score: local_tf / Math.max(global_tf, 0.001) });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((t) => t.term);
}

function compute_global_freq(clusters, docstrings) {
  const global_freq = new Map();
  let total = 0;

  for (const cluster of clusters) {
    for (const sym of cluster) {
      const tokens = tokenize(docstrings[sym] || sym);
      for (const tok of tokens) {
        global_freq.set(tok, (global_freq.get(tok) || 0) + 1);
        total++;
      }
    }
  }

  return { global_freq, total_tokens: total };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function log_stderr(msg) {
  process.stderr.write(msg + "\n");
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main() {
  const project_dir = path.resolve(process.argv[2] || process.cwd());

  if (!fs.existsSync(project_dir)) {
    log_stderr(`Error: directory not found: ${project_dir}`);
    process.exit(1);
  }

  log_stderr(`Cluster pipeline: scanning ${project_dir}`);

  // 1. Discover source files
  const source_files = collect_source_files(project_dir);
  if (source_files.length === 0) {
    log_stderr("Error: no supported source files found.");
    process.exit(1);
  }
  log_stderr(`Found ${source_files.length} source files.`);

  // 2. Build call graph via @ariadnejs/core
  const project = new Project();
  const file_contents = new Map();

  for (const file_path of source_files) {
    try {
      const content = fs.readFileSync(file_path, "utf-8");
      const relative_path = path.relative(project_dir, file_path);
      project.add_or_update_file(relative_path, content);
      file_contents.set(relative_path, content);
    } catch {
      // Skip unreadable files
    }
  }

  const call_graph = project.get_call_graph();
  const call_tree = {};
  for (const [symbol, node] of call_graph.nodes) {
    call_tree[symbol] = node;
  }

  const total_symbols = Object.keys(call_tree).length;
  log_stderr(`Call graph: ${total_symbols} symbols.`);

  if (total_symbols === 0) {
    log_stderr("Error: no symbols found in call graph.");
    process.exit(1);
  }

  // 3. Extract docstrings
  const docstrings = {};
  let documented_count = 0;

  for (const [relative_path, content] of file_contents) {
    const file_docs = extract_docstrings_from_content(content);

    for (const [symbol_name, info] of file_docs) {
      if (call_tree[symbol_name]) {
        docstrings[symbol_name] = info.body;
        documented_count++;
      }
    }
  }

  // Fallback for undocumented symbols
  for (const symbol of Object.keys(call_tree)) {
    if (!docstrings[symbol]) {
      docstrings[symbol] = symbol;
    }
  }

  log_stderr(
    `Docstrings: ${documented_count}/${total_symbols} documented.`
  );

  // 4. Compute hashes
  const content_hash = compute_content_hash(docstrings, call_tree);
  const source_hash = compute_source_hash(file_contents);

  // 5. Get embeddings (with cache)
  const cache_dir = path.join(project_dir, ".code-charter");
  fs.mkdirSync(cache_dir, { recursive: true });
  const cache_path = path.join(cache_dir, "cache.json");

  const { embeddings_map, symbols, all_embeddings } =
    await get_or_compute_embeddings(docstrings, content_hash, cache_path);

  // Update cache with cluster assignments after clustering
  // (will be written below)

  // 6. Run spectral clustering
  log_stderr("Running spectral clustering...");
  const clusters = await run_clustering(docstrings, call_tree, embeddings_map);
  log_stderr(`Found ${clusters.length} clusters.`);

  // 7. Build dependencies
  const { depends_on, depended_on_by } = build_cluster_dependencies(
    clusters,
    call_tree
  );

  // 8. Generate labels
  const { global_freq, total_tokens } = compute_global_freq(
    clusters,
    docstrings
  );

  // 9. Build per-cluster docstrings map for the skill to consume
  const cluster_docstrings = clusters.map((members) => {
    const member_docs = {};
    for (const sym of members) {
      member_docs[sym] = docstrings[sym] || sym;
    }
    return member_docs;
  });

  // 10. Build edges per cluster (for context)
  const cluster_edges = clusters.map((members, idx) => {
    const member_set = new Set(members);
    const edges = [];
    for (const sym of members) {
      const node = call_tree[sym];
      if (!node) continue;
      for (const call of node.calls) {
        if (member_set.has(call.symbol)) {
          edges.push({ from: sym, to: call.symbol });
        }
      }
    }
    return edges;
  });

  // 11. Assemble output
  const output = {
    content_hash,
    source_hash,
    generated_at: new Date().toISOString(),
    total_symbols,
    documented_count,
    clusters: clusters.map((members, idx) => {
      const top_terms = generate_cluster_label(
        members,
        docstrings,
        global_freq,
        total_tokens
      );
      return {
        cluster_id: idx,
        label: top_terms.join("-") || `cluster-${idx}`,
        members,
        docstrings: cluster_docstrings[idx],
        edges: cluster_edges[idx],
        depends_on: Array.from(depends_on.get(idx) || []),
        depended_on_by: Array.from(depended_on_by.get(idx) || []),
      };
    }),
  };

  // 12. Update cache.json with cluster assignments
  const symbol_to_cluster = new Map();
  for (let i = 0; i < clusters.length; i++) {
    for (const sym of clusters[i]) {
      symbol_to_cluster.set(sym, i);
    }
  }
  const cluster_assignments = symbols.map((s) => symbol_to_cluster.get(s) ?? -1);

  const cache_data = {
    content_hash,
    embedding_provider: "local:all-MiniLM-L6-v2",
    embeddings: embeddings_map,
    cluster_assignments,
    symbols,
  };
  write_embedding_cache(cache_path, cache_data);

  // 13. Output JSON to stdout
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  log_stderr("Pipeline complete.");
}

main().catch((err) => {
  log_stderr(`Fatal error: ${err.message || err}`);
  if (err.stack) log_stderr(err.stack);
  process.exit(1);
});
