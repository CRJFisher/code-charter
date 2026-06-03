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
    adapter: make_ariadne_adapter(project),
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

  it("preserves a user-edited description across re-sync (AC#6)", async () => {
    await run(["main.ts"]);
    const helper_desc_id = `${DESCRIPTION_NODE_KIND}:main.ts#helper:function`;
    // The user renames the meaning of helper's description (promotes the field to the user tier).
    store.write_fields({ kind: "node", id: helper_desc_id }, { description: "MY HAND-WRITTEN NOTE" }, "user");

    // Re-sync after an unrelated body edit to main.
    write("main.ts", MAIN_SRC.replace("+ 2", "+ 3"));
    await run(["main.ts"]);

    const desc = store.node(helper_desc_id);
    expect(desc?.attributes.description).toBe("MY HAND-WRITTEN NOTE");
    expect(desc?.field_ownership.description).toBe("user");
  });

  it("carries a user label across an id change and strands the old flow into the bin (AC#9 remap)", async () => {
    // entry + two helpers: a later rename of the entrypoint shares 2/4 members → 0.5 overlap (remap fires).
    const v1 = "export function entry() { return h1() + h2(); }\n\nfunction h1() { return 1; }\n\nfunction h2() { return 2; }\n";
    write("main.ts", v1);
    await run(["main.ts"]);
    const old_id = read_persisted_flows(store)[0].node.id;
    expect(old_id).toContain("entry:function");
    // The user renames the flow.
    store.write_fields({ kind: "node", id: old_id }, { label: "My Important Flow" }, "user");

    // Rename the entrypoint: flow id changes, but h1/h2 carry over → >=50% overlap → remap.
    write("main.ts", v1.replace(/entry/g, "entry_renamed"));
    await run(["main.ts"]);

    const live = read_persisted_flows(store);
    expect(live).toHaveLength(1); // old id superseded, new id is the only live flow
    const remapped = live[0];
    expect(remapped.node.id).toContain("entry_renamed:function");
    // The user label carried across AND is user-owned, so a future agentic pass cannot overwrite it.
    expect(remapped.node.attributes.label).toBe("My Important Flow");
    expect(remapped.node.field_ownership.label).toBe("user");
    // The old flow is stranded in the re-attachment bin (recoverable), not silently dropped.
    const old = store.all_nodes({ include_deleted: true }).find((n) => n.id === old_id);
    expect(old?.deleted_at).not.toBeNull();
  });

  it("re-syncs in place and advances last_synced_at without duplicating the flow (AC#1/#9)", async () => {
    await run(["main.ts"]);
    const flow_id = read_persisted_flows(store)[0].node.id;
    const first = read_persisted_flow(store, flow_id)!.node.attributes.last_synced_at as string;

    write("main.ts", MAIN_SRC.replace("+ 2", "+ 5"));
    await run(["main.ts"]);

    const flows = read_persisted_flows(store);
    expect(flows).toHaveLength(1);
    const second = flows[0].node.attributes.last_synced_at as string;
    expect(second > first).toBe(true);
    expect(flows[0].node.attributes.anchor_set_hash).toBeDefined();
  });
});
