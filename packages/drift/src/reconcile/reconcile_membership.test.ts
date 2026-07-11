import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { open_graph_store, type GraphStore } from "@code-charter/core";

import { make_ariadne_adapter } from "./ariadne_adapter";
import { HeadlessProject } from "./headless_project";
import { read_persisted_flows } from "./flow_store";
import { reconcile } from "./reconcile";
import type { ReconcileDeps } from "./types";

let repo: string;
let store: GraphStore;
let clock: number;

function write(rel: string, content: string): void {
  const abs = path.join(repo, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

async function run(file_set: string[]): Promise<void> {
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
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-mem-"));
  store = open_graph_store(path.join(repo, "graph.db"));
  clock = 0;
});

afterEach(() => {
  store.close();
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("reconcile — membership resolution", () => {
  it("re-syncs every flow whose induced subgraph contains a changed shared leaf", async () => {
    // Two entrypoints both reach `shared`; a change to `shared` must re-sync both flows.
    write(
      "app.ts",
      [
        "export function entry_a() { return shared(1); }",
        "export function entry_b() { return shared(2); }",
        "export function shared(n: number) { return n + 1; }",
      ].join("\n\n") + "\n",
    );
    await run(["app.ts"]);
    const flows = read_persisted_flows(store);
    expect(flows).toHaveLength(2); // one per entrypoint, both containing `shared`

    const before = new Map(flows.map((f) => [f.node.id, f.node.attributes.last_synced_at as string]));
    write(
      "app.ts",
      [
        "export function entry_a() { return shared(1); }",
        "export function entry_b() { return shared(2); }",
        "export function shared(n: number) { return n + 100; }",
      ].join("\n\n") + "\n",
    );
    await run(["app.ts"]);

    const after = read_persisted_flows(store);
    expect(after).toHaveLength(2); // no duplicates
    for (const flow of after) {
      expect((flow.node.attributes.last_synced_at as string) > before.get(flow.node.id)!).toBe(true);
    }
  });
});
