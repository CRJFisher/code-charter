/**
 * AC#2 — the membership/body-drift trigger core, in memory. A hand-built `CallGraph` and hand-built
 * persisted flows (no store needed: `affected_persisted_flows` is pure over its inputs) drive every
 * branch: a flow re-syncs iff its body OR membership drifted, and the two zero-seed shapes split on
 * whether the flow enumerates member edges.
 *
 * Graph: `entry` reaches `helper`; the flow's induced membership is `{entry, helper}`.
 */

import { describe, expect, it } from "@jest/globals";

import type { SymbolId } from "@ariadnejs/types";
import type { EdgeRow } from "@code-charter/core";
import { build_flow_member_edges, build_flow_node } from "@code-charter/core";

import { affected_persisted_flows } from "./affected_flows";
import type { PersistedFlow } from "./flow_store";
import { id_of, make_graph } from "./__fixtures__/agentic_graph";
import type { NodeSpec } from "./__fixtures__/agentic_graph";

const ENTRY: NodeSpec = { file: "m.ts", name: "entry", calls: [{ to: [id_of({ file: "m.ts", name: "helper" })] }] };
const HELPER: NodeSpec = { file: "m.ts", name: "helper" };
const ENTRY_ID = id_of(ENTRY);
const HELPER_ID = id_of(HELPER);
const INDUCED = [ENTRY_ID, HELPER_ID].sort();

const graph = make_graph([ENTRY, HELPER], [ENTRY]);

/** A persisted code flow: seed on the flow node's `entry_points`, `anchor_set` the stored membership snapshot. */
function code_flow(args: { seed_paths: string[]; anchor_set?: string[]; member_ids?: string[] }): PersistedFlow {
  const node = build_flow_node({
    id: args.seed_paths[0],
    label: "flow",
    entry_points: args.seed_paths,
    exit_points: [],
    rationale: "",
  });
  if (args.anchor_set !== undefined) node.attributes.anchor_set = args.anchor_set;
  const member_edges: readonly EdgeRow[] = build_flow_member_edges(args.seed_paths[0], args.member_ids ?? []);
  return { node, member_edges, bridge_edges: [] };
}

function affected(
  flows: PersistedFlow[],
  opts: { body_modified?: string[]; changed_files?: string[] } = {},
): string[] {
  const body_modified = new Set<SymbolId>((opts.body_modified ?? []).map((id) => id as SymbolId));
  return affected_persisted_flows(body_modified, flows, graph, new Set(opts.changed_files ?? [])).map((f) => f.node.id);
}

describe("affected_persisted_flows", () => {
  it("re-syncs on body drift only: a body-modified member with an up-to-date anchor_set", () => {
    const flow = code_flow({ seed_paths: [ENTRY_ID], anchor_set: INDUCED });
    expect(affected([flow], { body_modified: [HELPER_ID] })).toEqual([ENTRY_ID]);
  });

  it("re-syncs on membership drift only: a stale anchor_set with no body-modified member", () => {
    const flow = code_flow({ seed_paths: [ENTRY_ID], anchor_set: [ENTRY_ID] }); // helper not yet in the stored set
    expect(affected([flow])).toEqual([ENTRY_ID]);
  });

  it("re-syncs when both triggers fire", () => {
    const flow = code_flow({ seed_paths: [ENTRY_ID], anchor_set: [ENTRY_ID] });
    expect(affected([flow], { body_modified: [HELPER_ID] })).toEqual([ENTRY_ID]);
  });

  it("is a no-op when neither trigger fires (a whitespace/comment edit)", () => {
    const flow = code_flow({ seed_paths: [ENTRY_ID], anchor_set: INDUCED });
    expect(affected([flow])).toEqual([]);
  });

  it("re-syncs once to self-heal a flow with no stored anchor_set", () => {
    const flow = code_flow({ seed_paths: [ENTRY_ID] }); // anchor_set attribute absent
    expect(affected([flow])).toEqual([ENTRY_ID]);
  });

  it("leaves a zero-seed skill/doc flow alone: it enumerates member edges and re-syncs elsewhere", () => {
    // entry_points resolve to nothing in the graph (a doc id), so seeds is empty; member edges present.
    const flow = code_flow({ seed_paths: ["skill/SKILL.md#doc"], member_ids: ["skill/agents/reviewer.md#doc"] });
    expect(affected([flow], { changed_files: ["skill/SKILL.md"] })).toEqual([]);
  });

  it("surfaces a zero-seed code flow for retirement only when this turn touches its stored seed's file", () => {
    // No live seed and no member edges — a seed-gone code flow; retirement is on-demand, scoped to changed files.
    const flow = code_flow({ seed_paths: ["gone.ts#gone:function"] });
    expect(affected([flow], { changed_files: ["other.ts"] })).toEqual([]); // seed's file untouched → left alone
    expect(affected([flow], { changed_files: ["gone.ts"] })).toEqual(["gone.ts#gone:function"]); // touched → surfaced
  });
});
