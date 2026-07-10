/**
 * The describe step of hydration — deterministic, with no model in the loop.
 *
 * Runs the description policy (`plan_descriptions`) over a flow's anchorable members and combines the
 * `from_docstring`, `needs_llm`, and `placeholder` buckets into the `ResolvedDescription[]` the writer
 * (`write_descriptions`) persists: docstrings verbatim, the symbol name as a placeholder for the rest.
 * Agent-authored text never flows through here — the drift-sync skill persists it directly via
 * `drift-reconcile --apply-descriptions`, and the content-hash cache makes this deterministic pass a
 * no-op for members the agent already described at their current hash.
 */

import type { AnchoredSymbol, GraphStore, ResolvedDescription } from "@code-charter/core";
import { DESCRIPTION_NODE_KIND, plan_descriptions } from "@code-charter/core";

/**
 * What is already persisted for each symbol_path, so unchanged members skip re-description and the
 * `--apply-descriptions` mode can tell an identical re-submission (a cache hit) from a revision.
 */
export function existing_descriptions(
  store: GraphStore,
): Map<string, { described_at_content_hash: string; text: string | undefined }> {
  const existing = new Map<string, { described_at_content_hash: string; text: string | undefined }>();
  for (const node of store.all_nodes()) {
    if (node.kind !== DESCRIPTION_NODE_KIND) continue;
    const hash = node.attributes.description_hash;
    if (typeof hash !== "string") continue;
    const text = node.attributes.description;
    // id is `${DESCRIPTION_NODE_KIND}:${symbol_path}`; recover the symbol_path suffix.
    const symbol_path = node.id.slice(DESCRIPTION_NODE_KIND.length + 1);
    existing.set(symbol_path, {
      described_at_content_hash: hash,
      text: typeof text === "string" ? text : undefined,
    });
  }
  return existing;
}

/**
 * Plan + combine descriptions for a flow's anchorable members. Returns the resolved descriptions
 * ready for `write_descriptions` — docstrings verbatim, the symbol name as a placeholder for the
 * rest. Deterministic and byte-stable.
 */
export function resolve_descriptions(store: GraphStore, members: readonly AnchoredSymbol[]): ResolvedDescription[] {
  const file_by_path = new Map(members.map((m) => [m.symbol_path, m.file_path]));
  const describe_members = members.map((m) => ({
    symbol_path: m.symbol_path,
    content_hash: m.content_hash,
    name: m.definition.name,
    definition: m.definition,
  }));

  const plan = plan_descriptions(describe_members, { existing: existing_descriptions(store) });

  const resolved: ResolvedDescription[] = [];
  const push = (symbol_path: string, content_hash: string, text: string, source: ResolvedDescription["source"]) => {
    const file_path = file_by_path.get(symbol_path);
    if (file_path !== undefined) resolved.push({ symbol_path, content_hash, file_path, text, source });
  };

  for (const p of plan.from_docstring) push(p.symbol_path, p.content_hash, p.text ?? p.name, "docstring");
  // The `needs_llm` bucket is the agent's to fill (phase 2 of the drift-sync skill); the deterministic
  // pass writes the name as a `provisional` stand-in so the flow hydrates complete, and the agent's
  // later `--apply-descriptions` upgrade overwrites it. `provisional` (not `placeholder`) keeps an
  // awaiting-real-text member distinguishable from a terminal over-cap placeholder if that pass never
  // runs (AC#3).
  for (const p of plan.needs_llm) push(p.symbol_path, p.content_hash, p.name, "provisional");
  for (const p of plan.placeholder) push(p.symbol_path, p.content_hash, p.text ?? p.name, "placeholder");

  return resolved;
}
