/**
 * The describe step of hydration — the model-call seam, deterministic-first.
 *
 * task-27.1.4 ships the pure description *policy* (`plan_descriptions`) and the agentic-owned *writer*
 * (`write_descriptions`) but only a `null_describe_executor`. This module is task-27.1.6's contribution:
 * it runs the policy over a flow's anchorable members, invokes the injected {@link DescribeBatchExecutor}
 * over the `needs_llm` bucket, and combines its results with the `from_docstring` / `placeholder` buckets
 * into the `ResolvedDescription[]` the writer persists.
 *
 * The default executor is `null` — descriptions then come entirely from docstrings/frontmatter and name
 * placeholders, so the skill-flow target hydrates with no model call. The seam exists so the
 * drift-reconciler sub-agent CAN supply descriptions from its own run, but v1 never requires it.
 */

import type { AnchoredSymbol, DescribeBatchExecutor, DescribeMember, GraphStore, ResolvedDescription } from "@code-charter/core";
import { DESCRIPTION_NODE_KIND, null_describe_executor, plan_descriptions } from "@code-charter/core";

export { null_describe_executor };
export type { DescribeBatchExecutor };

/** What is already persisted for each symbol_path, so unchanged members skip re-description. */
function existing_descriptions(store: GraphStore): Map<string, { described_at_content_hash: string }> {
  const existing = new Map<string, { described_at_content_hash: string }>();
  for (const node of store.all_nodes()) {
    if (node.kind !== DESCRIPTION_NODE_KIND) continue;
    const hash = node.attributes.description_hash;
    if (typeof hash !== "string") continue;
    // id is `${DESCRIPTION_NODE_KIND}:${symbol_path}`; recover the symbol_path suffix.
    const symbol_path = node.id.slice(DESCRIPTION_NODE_KIND.length + 1);
    existing.set(symbol_path, { described_at_content_hash: hash });
  }
  return existing;
}

/**
 * Plan + run + combine descriptions for a flow's anchorable members. Returns the resolved descriptions
 * ready for `write_descriptions`. Deterministic given a deterministic executor (the default is `null`).
 */
export async function resolve_descriptions(
  store: GraphStore,
  members: readonly AnchoredSymbol[],
  executor: DescribeBatchExecutor = null_describe_executor,
): Promise<ResolvedDescription[]> {
  const file_by_path = new Map(members.map((m) => [m.symbol_path, m.file_path]));
  const describe_members: DescribeMember[] = members.map((m) => ({
    symbol_path: m.symbol_path,
    content_hash: m.content_hash,
    name: m.definition.name,
    definition: m.definition,
  }));

  const plan = plan_descriptions(describe_members, { existing: existing_descriptions(store) });

  const llm = await executor(plan.needs_llm.map((p) => {
    const member = members.find((m) => m.symbol_path === p.symbol_path)!;
    return { symbol_path: p.symbol_path, content_hash: p.content_hash, name: p.name, definition: member.definition };
  }));
  const llm_by_path = new Map(llm.map((r) => [r.symbol_path, r.text]));

  const resolved: ResolvedDescription[] = [];
  const push = (symbol_path: string, content_hash: string, text: string, source: ResolvedDescription["source"]) => {
    const file_path = file_by_path.get(symbol_path);
    if (file_path !== undefined) resolved.push({ symbol_path, content_hash, file_path, text, source });
  };

  for (const p of plan.from_docstring) push(p.symbol_path, p.content_hash, p.text ?? p.name, "docstring");
  for (const p of plan.needs_llm) {
    const text = llm_by_path.get(p.symbol_path);
    // An executor that returns nothing for a candidate falls back to the name placeholder (no gap).
    if (text !== undefined) push(p.symbol_path, p.content_hash, text, "llm");
    else push(p.symbol_path, p.content_hash, p.name, "placeholder");
  }
  for (const p of plan.placeholder) push(p.symbol_path, p.content_hash, p.text ?? p.name, "placeholder");

  return resolved;
}
