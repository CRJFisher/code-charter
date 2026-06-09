import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  DESCRIPTION_NODE_KIND,
  FLOW_NODE_KIND,
  open_graph_store,
  type GraphStore,
} from "@code-charter/core";

import { make_ariadne_adapter } from "./ariadne_adapter";
import { HeadlessProject } from "./headless_project";
import { read_persisted_flow, read_persisted_flows } from "./flow_store";
import { reconcile } from "./reconcile";
import type { ReconcileDeps } from "./types";

let repo: string;
let store: GraphStore;
let clock: number;

const MAIN_SRC = "export function main() {\n  return helper(1) + 2;\n}\n\nexport function helper(n: number) {\n  return n + 1;\n}\n";

function write(rel: string, content: string): void {
  const abs = path.join(repo, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

async function run(file_set: string[]): Promise<ReconcileDeps> {
  const project = new HeadlessProject(repo);
  await project.initialize();
  const deps: ReconcileDeps = {
    store,
    adapter: make_ariadne_adapter(project, () => {}),
    repo_root_abs: repo,
    analyzed_root: "",
    now: () => new Date(2026, 0, 1, 0, 0, clock++).toISOString(),
    log: () => {},
  };
  await reconcile(file_set, deps);
  return deps;
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-code-"));
  store = open_graph_store(path.join(repo, "graph.db"));
  clock = 0;
  write("main.ts", MAIN_SRC);
});

afterEach(() => {
  store.close();
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("reconcile — code flow (full Ariadne headless path)", () => {
  it("hydrates an entrypoint tree into an agentic.flow and describes its members", async () => {
    await run(["main.ts"]);

    const flows = read_persisted_flows(store);
    expect(flows).toHaveLength(1);
    expect(flows[0].node.kind).toBe(FLOW_NODE_KIND);
    expect(flows[0].node.id).toBe("main.ts#main:function");
    // The seed rides entry_points (not a self-referential member edge); both members are described.
    expect(flows[0].node.attributes.entry_points).toEqual(["main.ts#main:function"]);

    const descriptions = store.all_nodes().filter((n) => n.kind === DESCRIPTION_NODE_KIND).map((n) => n.id);
    expect(descriptions).toEqual(
      expect.arrayContaining([
        `${DESCRIPTION_NODE_KIND}:main.ts#main:function`,
        `${DESCRIPTION_NODE_KIND}:main.ts#helper:function`,
      ]),
    );
  });

  it("does not regenerate an unchanged member's description on an unrelated re-sync (content-hash cost guard, AC#6)", async () => {
    await run(["main.ts"]);
    const helper_desc_id = `${DESCRIPTION_NODE_KIND}:main.ts#helper:function`;
    const before = store.node(helper_desc_id)!;
    expect(before.attributes.description_hash).toBeDefined();

    // Re-sync after an unrelated body edit to main; helper's body is unchanged, so the content-hash
    // guard skips re-describing it and its description node is left untouched.
    write("main.ts", MAIN_SRC.replace("+ 2", "+ 3"));
    await run(["main.ts"]);

    const after = store.node(helper_desc_id)!;
    expect(after.attributes.description).toBe(before.attributes.description);
    expect(after.attributes.description_hash).toBe(before.attributes.description_hash);
  });

  it("retires a superseded flow when its entrypoint is renamed, re-hydrating a fresh flow under the new id", async () => {
    const v1 = "export function entry() { return h1() + h2(); }\n\nfunction h1() { return 1; }\n\nfunction h2() { return 2; }\n";
    write("main.ts", v1);
    await run(["main.ts"]);
    const old_id = read_persisted_flows(store)[0].node.id;
    expect(old_id).toContain("entry:function");

    // Rename the entrypoint: the flow id changes, so the old flow is retired and a fresh flow hydrates.
    write("main.ts", v1.replace(/entry/g, "entry_renamed"));
    await run(["main.ts"]);

    const live = read_persisted_flows(store);
    expect(live).toHaveLength(1); // old id superseded, new id is the only live flow
    expect(live[0].node.id).toContain("entry_renamed:function");
    // The old flow is retired (soft-deleted), not left live and stale.
    const old = store.all_nodes({ include_deleted: true }).find((n) => n.id === old_id);
    expect(old?.deleted_at).not.toBeNull();
  });

  it("re-syncs in place and advances last_synced_at without duplicating the flow (AC#1)", async () => {
    await run(["main.ts"]);
    const flow_id = read_persisted_flows(store)[0].node.id;
    const first = read_persisted_flow(store, flow_id)!.node.attributes.last_synced_at as string;

    write("main.ts", MAIN_SRC.replace("+ 2", "+ 5"));
    await run(["main.ts"]);

    const flows = read_persisted_flows(store);
    expect(flows).toHaveLength(1);
    const second = flows[0].node.attributes.last_synced_at as string;
    expect(second > first).toBe(true);
    expect(flows[0].node.attributes.anchor_set).toBeDefined();
  });
});
