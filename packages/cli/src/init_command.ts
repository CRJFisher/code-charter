import { Project } from "@ariadnejs/core";
import type { CallableNode } from "@ariadnejs/types";
import type {
  ClusterSummariesFile,
  ClusterSummaryEntry,
  CacheFile,
  DocstringInfo,
} from "@code-charter/types";
import { LocalEmbeddingsProvider } from "./local_embeddings_provider";
import { ClusteringService } from "./clustering_service";
import { FsCacheStorage } from "./fs_cache_storage";
import { RegexDocstringProvider } from "./regex_docstring_provider";
import { compute_content_hash, compute_source_hash } from "./content_hash";
import { generate_cluster_summaries } from "./heuristic_summarizer";
import { ProgressReporter } from "./progress";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

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

/**
 * Recursively collect source file paths from a directory.
 */
function collect_source_files(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

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

/**
 * Build the inter-cluster dependency maps from the call graph.
 */
function build_cluster_dependencies(
  clusters: string[][],
  call_tree: Record<string, CallableNode>
): { depends_on: Map<number, Set<number>>; depended_on_by: Map<number, Set<number>> } {
  const symbol_to_cluster = new Map<string, number>();
  for (let i = 0; i < clusters.length; i++) {
    for (const symbol of clusters[i]) {
      symbol_to_cluster.set(symbol, i);
    }
  }

  const depends_on = new Map<number, Set<number>>();
  const depended_on_by = new Map<number, Set<number>>();

  for (let i = 0; i < clusters.length; i++) {
    depends_on.set(i, new Set());
    depended_on_by.set(i, new Set());
  }

  for (const [symbol, node] of Object.entries(call_tree)) {
    const source_cluster = symbol_to_cluster.get(symbol);
    if (source_cluster === undefined) continue;

    for (const call of node.enclosed_calls) {
      for (const resolution of call.resolutions) {
        const target_cluster = symbol_to_cluster.get(resolution.symbol_id);
        if (target_cluster !== undefined && target_cluster !== source_cluster) {
          depends_on.get(source_cluster)!.add(target_cluster);
          depended_on_by.get(target_cluster)!.add(source_cluster);
        }
      }
    }
  }

  return { depends_on, depended_on_by };
}

/**
 * Run the full code-charter init pipeline on a target directory.
 *
 * 1. Scan source files and build call graph via @ariadnejs/core
 * 2. Extract docstrings with RegexDocstringProvider
 * 3. Generate embeddings with LocalEmbeddingsProvider
 * 4. Run spectral clustering via clustering-tfjs
 * 5. Generate heuristic cluster descriptions
 * 6. Write cluster-summaries.json and .code-charter/cache.json
 */
export async function run_init(target_dir: string): Promise<void> {
  const resolved_dir = path.resolve(target_dir);

  if (!fs.existsSync(resolved_dir)) {
    console.error(`Error: directory not found: ${resolved_dir}`);
    process.exit(1);
  }

  console.log(`\nInitializing Code Charter for: ${resolved_dir}\n`);

  const progress = new ProgressReporter(6);

  // Step 1: Scan files and build call graph
  progress.report("Scanning source files...");
  const source_files = collect_source_files(resolved_dir);

  if (source_files.length === 0) {
    console.error("Error: no supported source files found.");
    process.exit(1);
  }

  progress.detail(`Found ${source_files.length} source files`);

  const project = new Project();
  const file_contents = new Map<string, string>();

  for (const file_path of source_files) {
    const content = fs.readFileSync(file_path, "utf-8");
    const relative_path = path.relative(resolved_dir, file_path);
    project.add_or_update_file(relative_path, content);
    file_contents.set(relative_path, content);
  }

  const call_graph = project.get_call_graph();
  const call_tree: Record<string, CallableNode> = {};
  for (const [symbol, node] of call_graph.nodes) {
    call_tree[symbol] = node;
  }

  progress.detail(`Call graph: ${Object.keys(call_tree).length} symbols`);

  // Step 2: Extract docstrings
  progress.report("Extracting docstrings...");
  const docstring_provider = new RegexDocstringProvider();
  const docstrings: Record<string, string> = {};
  let documented_count = 0;

  for (const [relative_path, content] of file_contents) {
    const file_docstrings = docstring_provider.get_docstrings(relative_path, content);

    for (const [symbol_name, info] of file_docstrings) {
      // Only include symbols that exist in the call graph
      if (call_tree[symbol_name]) {
        docstrings[symbol_name] = info.body;
        documented_count++;
      }
    }
  }

  // Add fallback descriptions for undocumented symbols
  for (const symbol of Object.keys(call_tree)) {
    if (!docstrings[symbol]) {
      docstrings[symbol] = symbol;
    }
  }

  const total_symbols = Object.keys(call_tree).length;
  const coverage_pct = total_symbols > 0
    ? ((documented_count / total_symbols) * 100).toFixed(1)
    : "0.0";
  progress.detail(`Docstring coverage: ${documented_count}/${total_symbols} (${coverage_pct}%)`);

  // Bail early if too few symbols to cluster
  if (total_symbols < 3) {
    console.log("\nToo few symbols to cluster. Writing minimal output...");
    write_minimal_output(resolved_dir, docstrings, call_tree, file_contents);
    return;
  }

  // Step 3: Generate embeddings
  progress.report("Generating embeddings...");
  const cache_dir = path.join(resolved_dir, ".code-charter");
  fs.mkdirSync(cache_dir, { recursive: true });

  const cache_storage = new FsCacheStorage(cache_dir);
  const embeddings_provider = new LocalEmbeddingsProvider((msg) => {
    progress.detail(msg);
  });

  // Step 4: Run spectral clustering
  progress.report("Clustering symbols...");
  const clustering_service = new ClusteringService({
    embedding_provider: embeddings_provider,
    cache_storage,
    progress_reporter: (msg) => progress.detail(msg),
  });

  const clusters = await clustering_service.cluster(docstrings, call_tree);
  progress.detail(`Found ${clusters.length} clusters`);

  // Step 5: Generate heuristic descriptions
  progress.report("Generating cluster descriptions...");
  const cluster_summaries = generate_cluster_summaries(clusters, docstrings);

  // Step 6: Write output files
  progress.report("Writing output files...");

  const content_hash = compute_content_hash(docstrings, call_tree);
  const source_hash = compute_source_hash(file_contents);

  const { depends_on, depended_on_by } = build_cluster_dependencies(clusters, call_tree);

  const cluster_entries: ClusterSummaryEntry[] = cluster_summaries.map((summary, idx) => ({
    cluster_id: idx,
    label: summary.top_terms.slice(0, 3).join("-") || `cluster-${idx}`,
    description: summary.description,
    members: clusters[idx],
    depends_on: Array.from(depends_on.get(idx) || []),
    depended_on_by: Array.from(depended_on_by.get(idx) || []),
  }));

  const summaries_file: ClusterSummariesFile = {
    content_hash,
    source_hash,
    generated_at: new Date().toISOString(),
    clusters: cluster_entries,
  };

  // Write cluster-summaries.json (tracked in git)
  const summaries_path = path.join(resolved_dir, "cluster-summaries.json");
  fs.writeFileSync(summaries_path, JSON.stringify(summaries_file, null, 2), "utf-8");
  progress.detail(`Wrote ${summaries_path}`);

  // Write .code-charter/cache.json (gitignored)
  const all_embeddings = await embeddings_provider.getEmbeddings(
    Object.values(docstrings)
  );
  const symbols = Object.keys(docstrings);

  // Build cluster_assignments array: for each symbol, which cluster index it belongs to
  const symbol_to_cluster = new Map<string, number>();
  for (let i = 0; i < clusters.length; i++) {
    for (const sym of clusters[i]) {
      symbol_to_cluster.set(sym, i);
    }
  }
  const cluster_assignments = symbols.map((s) => symbol_to_cluster.get(s) ?? -1);

  const embeddings_map: Record<string, number[]> = {};
  symbols.forEach((sym, idx) => {
    embeddings_map[sym] = all_embeddings[idx];
  });

  const cache_file: CacheFile = {
    content_hash,
    embedding_provider: "local:all-MiniLM-L6-v2",
    embeddings: embeddings_map,
    cluster_assignments,
    symbols,
  };

  const cache_path = path.join(cache_dir, "cache.json");
  fs.writeFileSync(cache_path, JSON.stringify(cache_file), "utf-8");
  progress.detail(`Wrote ${cache_path}`);

  // Ensure .code-charter is gitignored
  ensure_gitignore(resolved_dir);

  progress.done(
    `${clusters.length} clusters, ${total_symbols} symbols, ${coverage_pct}% docstring coverage.`
  );
}

/**
 * Write minimal output when there are too few symbols to cluster.
 */
function write_minimal_output(
  resolved_dir: string,
  docstrings: Record<string, string>,
  call_tree: Record<string, CallableNode>,
  file_contents: Map<string, string>
): void {
  const content_hash = compute_content_hash(docstrings, call_tree);
  const source_hash = compute_source_hash(file_contents);
  const symbols = Object.keys(call_tree);

  const summaries_file: ClusterSummariesFile = {
    content_hash,
    source_hash,
    generated_at: new Date().toISOString(),
    clusters: [
      {
        cluster_id: 0,
        label: "all",
        description: `All symbols (${symbols.length})`,
        members: symbols,
        depends_on: [],
        depended_on_by: [],
      },
    ],
  };

  const summaries_path = path.join(resolved_dir, "cluster-summaries.json");
  fs.writeFileSync(summaries_path, JSON.stringify(summaries_file, null, 2), "utf-8");
  console.log(`Wrote ${summaries_path}`);
}

/**
 * Ensure .code-charter/ is in the .gitignore file.
 */
function ensure_gitignore(resolved_dir: string): void {
  const gitignore_path = path.join(resolved_dir, ".gitignore");
  const entry = ".code-charter/";

  try {
    if (fs.existsSync(gitignore_path)) {
      const content = fs.readFileSync(gitignore_path, "utf-8");
      if (content.includes(entry)) return;
      fs.appendFileSync(gitignore_path, `\n${entry}\n`);
    } else {
      fs.writeFileSync(gitignore_path, `${entry}\n`, "utf-8");
    }
  } catch {
    // Silently skip if we can't write .gitignore
  }
}
