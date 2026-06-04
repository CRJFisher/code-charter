import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  FLOW_NODE_KIND,
  open_graph_store,
  project_hydrated_flow,
  read_hydrated_flows,
  reconstruct_flow_membership,
  type GraphStore,
} from "@code-charter/core";

import { make_ariadne_adapter } from "./ariadne_adapter";
import { HeadlessProject } from "./headless_project";
import { read_persisted_flow, read_persisted_flows } from "./flow_store";
import { reconcile } from "./reconcile";
import type { ReconcileDeps } from "./types";

// The skill corpus shipped with the task-21.2 extractor port — the AC#3 first end-to-end target.
const SKILLS_ROOT = path.resolve(__dirname, "..", "..", "..", "core", "src", "extractors", "__fixtures__", "skills");
const SKILL_REL = "skill-diagrammer/SKILL.md";
const SKILL_FLOW_ID = "agentic.flow:skill:skill-diagrammer";
const SKILL_DOC_ID = "skill-diagrammer/SKILL.md#doc";

let tmp_dir: string;
let store: GraphStore;
let clock: number;

function make_deps(): ReconcileDeps {
  return {
    store,
    adapter: undefined as never, // replaced per call after the project indexes
    repo_root_abs: SKILLS_ROOT,
    analyzed_root: "",
    now: () => new Date(2026, 0, 1, 0, 0, clock++).toISOString(),
    log: () => {},
  };
}

async function run(file_set: string[]): Promise<ReconcileDeps> {
  const project = new HeadlessProject(SKILLS_ROOT);
  await project.initialize();
  const deps = { ...make_deps(), adapter: make_ariadne_adapter(project, () => {}) };
  await reconcile(file_set, deps);
  return deps;
}

beforeEach(() => {
  tmp_dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-recon-"));
  store = open_graph_store(path.join(tmp_dir, "graph.db"));
  clock = 0;
});

afterEach(() => {
  store.close();
  fs.rmSync(tmp_dir, { recursive: true, force: true });
});

describe("reconcile — skill flow (AC#3)", () => {
  it("hydrates a skill bundle into exactly one agentic.flow scoped to the skill dir", async () => {
    await run([SKILL_REL]);

    const flows = read_persisted_flows(store);
    expect(flows).toHaveLength(1);
    expect(flows[0].node.id).toBe(SKILL_FLOW_ID);
    expect(flows[0].node.kind).toBe(FLOW_NODE_KIND);
    expect(flows[0].node.layer).toBe("agentic");
    expect(flows[0].node.attributes.last_synced_at).toBeDefined();

    // Every member belongs to the skill dir — the ground-truth boundary.
    for (const edge of flows[0].member_edges) {
      expect(edge.dst_id.startsWith("skill-diagrammer/")).toBe(true);
    }
  });

  it("exposes the hydrated flow to list_flows and renders its doc members", async () => {
    const deps = await run([SKILL_REL]);
    const summaries = read_hydrated_flows(store.all_nodes());
    expect(summaries.map((s) => s.id)).toContain(SKILL_FLOW_ID);

    const flow = read_persisted_flow(store, SKILL_FLOW_ID)!;
    const graph = deps.adapter.call_graph();
    const membership = reconstruct_flow_membership(
      { flow_node: flow.node, member_edges: flow.member_edges, bridge_edges: flow.bridge_edges },
      graph,
    );
    const doc_nodes = store.all_nodes().filter((n) => (membership.linked_docs ?? []).includes(n.id));
    const rendered = project_hydrated_flow(membership, graph, doc_nodes);
    // SKILL.md + references + sub-agent docs render as nodes.
    expect(rendered.nodes.length).toBeGreaterThan(1);
    expect(rendered.nodes.some((n) => n.id === SKILL_DOC_ID)).toBe(true);
  });

  it("persists agentic.bridge edges from meta.json sub_agents[] (AC#2)", async () => {
    await run([SKILL_REL]);
    const bridges = store.all_edges().filter((e) => e.kind === "agentic.bridge");
    expect(bridges.length).toBeGreaterThan(0);
    for (const bridge of bridges) {
      expect(bridge.layer).toBe("agentic");
      expect(bridge.confidence).toBeLessThan(1);
      expect(typeof bridge.attributes.inference_rationale).toBe("string");
      expect(bridge.attributes.extractor).toBeUndefined();
    }
  });

  it("re-syncs in place on a second run: same id, stamped later, no duplicate flow (AC#1/#9)", async () => {
    await run([SKILL_REL]);
    const first = read_persisted_flow(store, SKILL_FLOW_ID)!;
    const first_stamp = first.node.attributes.last_synced_at as string;

    await run([SKILL_REL]);
    const flows = read_persisted_flows(store);
    expect(flows).toHaveLength(1); // no duplicate
    const second_stamp = flows[0].node.attributes.last_synced_at as string;
    expect(second_stamp >= first_stamp).toBe(true);
  });

  it("no-ops on an empty file set", async () => {
    const deps = await run([]);
    expect(read_persisted_flows(deps.store)).toHaveLength(0);
  });
});
