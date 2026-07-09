import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { CallGraph } from "@ariadnejs/types";
import {
  BRIDGE_EDGE_KIND,
  DESCRIPTION_NODE_KIND,
  FLOW_NODE_KIND,
  open_graph_store,
  type GraphStore,
} from "@code-charter/core";

import { make_ariadne_adapter } from "./ariadne_adapter";
import type { AriadneAdapter } from "./ariadne_adapter";
import { HeadlessProject } from "./headless_project";
import { hydrate_code_flow, hydrate_skill_flow } from "./hydrate";
import type { CodeUmbrella, SkillUmbrella } from "./hydrate";
import { read_persisted_flow } from "./flow_store";
import type { ReconcileDeps } from "./types";

const MAIN_SRC =
  "export function main() {\n  return helper(1) + 2;\n}\n\nexport function helper(n: number) {\n  return n + 1;\n}\n";

// One Ariadne-backed project per file: Project state accumulates per-process, and hydrate only reads
// the graph/adapter (it writes solely to the injected store), so a single shared graph is safe.
let repo: string;
let adapter: AriadneAdapter;
let graph: CallGraph;

beforeAll(async () => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-hydrate-"));
  fs.writeFileSync(path.join(repo, "main.ts"), MAIN_SRC);
  const project = new HeadlessProject(repo);
  await project.initialize();
  adapter = make_ariadne_adapter(project, () => {});
  graph = adapter.call_graph();
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

let store: GraphStore;
let clock: number;

beforeEach(() => {
  store = open_graph_store(":memory:");
  clock = 0;
});

afterEach(() => {
  store.close();
});

function make_deps(over: Partial<ReconcileDeps> = {}): ReconcileDeps {
  return {
    store,
    adapter,
    repo_root_abs: repo,
    analyzed_root: "",
    now: () => new Date(2026, 0, 1, 0, 0, clock++).toISOString(),
    log: () => {},
    ...over,
  };
}

const SKILL_ID = "agentic.flow:skill:demo";
const SKILL_DOC = "demo/SKILL.md#doc";
const REVIEWER_DOC = "demo/agents/reviewer.md#doc";

function skill_umbrella(over: Partial<SkillUmbrella> = {}): SkillUmbrella {
  return {
    kind: "skill",
    id: SKILL_ID,
    label: "demo",
    skill_doc_id: SKILL_DOC,
    doc_node_ids: [REVIEWER_DOC, SKILL_DOC, "demo/scripts/run.md#doc"],
    meta_json_source: null,
    meta_json_path: "demo/meta.json",
    resolve_subagent: () => undefined,
    ...over,
  };
}

describe("hydrate_skill_flow", () => {
  it("persists one flow whose members are the sorted bundle doc ids", async () => {
    const umbrella = skill_umbrella();
    const outcome = await hydrate_skill_flow(make_deps(), umbrella);

    expect(outcome).toEqual(
      expect.objectContaining({ flow_id: SKILL_ID, action: "hydrate", kind: "skill", member_count: 3 }),
    );

    const flow = read_persisted_flow(store, SKILL_ID)!;
    expect(flow.node.kind).toBe(FLOW_NODE_KIND);
    expect(flow.node.attributes.entry_points).toEqual([SKILL_DOC]);
    expect(flow.node.attributes.last_synced_at).toBe(outcome.last_synced_at);
    expect(flow.member_edges.map((e) => e.dst_id)).toEqual([...umbrella.doc_node_ids].sort());
  });

  it("writes a meta.json sub_agents[] declaration as an agentic.bridge from the flow to the resolved doc", async () => {
    const umbrella = skill_umbrella({
      meta_json_source: JSON.stringify({ sub_agents: ["reviewer"] }),
      resolve_subagent: (name) => (name === "reviewer" ? REVIEWER_DOC : undefined),
    });
    await hydrate_skill_flow(make_deps(), umbrella);

    const bridges = store.all_edges().filter((e) => e.kind === BRIDGE_EDGE_KIND);
    expect(bridges.map((e) => ({ src: e.src_id, dst: e.dst_id }))).toEqual([{ src: SKILL_ID, dst: REVIEWER_DOC }]);
  });

  it("writes no bridge edges when the bundle has no meta.json", async () => {
    await hydrate_skill_flow(make_deps(), skill_umbrella({ meta_json_source: null }));

    expect(store.all_edges().filter((e) => e.kind === BRIDGE_EDGE_KIND)).toEqual([]);
  });

  it("skips an unresolvable sub-agent declaration", async () => {
    const umbrella = skill_umbrella({
      meta_json_source: JSON.stringify({ sub_agents: ["ghost"] }),
      resolve_subagent: () => undefined,
    });
    await hydrate_skill_flow(make_deps(), umbrella);

    expect(store.all_edges().filter((e) => e.kind === BRIDGE_EDGE_KIND)).toEqual([]);
  });
});

const CODE_FLOW_ID = "main.ts#main:function";

function code_umbrella(over: Partial<CodeUmbrella> = {}): CodeUmbrella {
  return { kind: "code", id: CODE_FLOW_ID, label: "main", seeds: graph.entry_points, ...over };
}

describe("hydrate_code_flow", () => {
  it("persists the seed's reachable subgraph as the anchor_set and describes every member by default", async () => {
    const { outcome, description_counts } = await hydrate_code_flow(make_deps(), code_umbrella(), graph);

    expect(outcome).toEqual(
      expect.objectContaining({ flow_id: CODE_FLOW_ID, action: "hydrate", kind: "code", member_count: 2 }),
    );
    expect(description_counts).toEqual({ docstring: 0, provisional: 2, placeholder: 0, llm: 0 });

    const flow = read_persisted_flow(store, CODE_FLOW_ID)!;
    expect(flow.node.attributes.anchor_set).toEqual(["main.ts#helper:function", "main.ts#main:function"]);

    const descriptions = store
      .all_nodes()
      .filter((n) => n.kind === DESCRIPTION_NODE_KIND)
      .map((n) => n.id)
      .sort();
    expect(descriptions).toEqual([
      `${DESCRIPTION_NODE_KIND}:main.ts#helper:function`,
      `${DESCRIPTION_NODE_KIND}:main.ts#main:function`,
    ]);
  });

  it("persists the flow and its members but writes no descriptions when describe is false (the cap-overflow stub)", async () => {
    const { outcome, description_counts } = await hydrate_code_flow(make_deps(), code_umbrella(), graph, {
      describe: false,
    });

    expect(outcome.member_count).toBe(2);
    expect(description_counts).toEqual({ docstring: 0, provisional: 0, placeholder: 0, llm: 0 });
    expect(read_persisted_flow(store, CODE_FLOW_ID)!.node.attributes.anchor_set).toEqual([
      "main.ts#helper:function",
      "main.ts#main:function",
    ]);
    expect(store.all_nodes().filter((n) => n.kind === DESCRIPTION_NODE_KIND)).toEqual([]);
  });

  it("threads the detection goal into the entrypoint default rationale", async () => {
    await hydrate_code_flow(make_deps({ goal: "custom-goal" }), code_umbrella(), graph);

    expect(read_persisted_flow(store, CODE_FLOW_ID)!.node.attributes.rationale).toBe(
      "entrypoint 'main' and its reachable subgraph (goal: custom-goal)",
    );
  });

  it("persists the agent-authored rationale verbatim on the stitch path", async () => {
    await hydrate_code_flow(make_deps(), code_umbrella({ rationale: "grouped by the agent" }), graph);

    expect(read_persisted_flow(store, CODE_FLOW_ID)!.node.attributes.rationale).toBe("grouped by the agent");
  });
});
