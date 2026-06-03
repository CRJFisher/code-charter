import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { DESCRIPTION_NODE_KIND, open_graph_store, type GraphStore } from "@code-charter/core";

import { re_attachment_bin } from "../mcp/re_attachment_bin";
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
    adapter: make_ariadne_adapter(project),
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

describe("reconcile — membership resolution (AC#5)", () => {
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

describe("reconcile — re-attachment bin (AC#7)", () => {
  it("sends a user-owned description to the bin when its symbol is renamed and re-bodied (a miss)", async () => {
    write(
      "lib.ts",
      "export function main() { return helper(1); }\n\nexport function helper(n: number) { return n + 1; }\n",
    );
    await run(["lib.ts"]);

    const helper_desc = `${DESCRIPTION_NODE_KIND}:lib.ts#helper:function`;
    store.write_fields({ kind: "node", id: helper_desc }, { description: "USER NOTE on helper" }, "user");
    expect(re_attachment_bin(store)).toHaveLength(0);

    // Rename helper → renamed AND change its body: the resolver can neither match the old symbol_path
    // nor the old content_hash → a miss → the preserved description is soft-deleted into the bin.
    write(
      "lib.ts",
      "export function main() { return renamed(1); }\n\nexport function renamed(n: number) { return n * 7 + 42; }\n",
    );
    await run(["lib.ts"]);

    const bin = re_attachment_bin(store);
    expect(bin.some((entry) => entry.id === helper_desc)).toBe(true);
    // Never auto-pruned: the soft-deleted row is still present, recoverable via drift.resolve.
    const binned = store.all_nodes({ include_deleted: true }).find((n) => n.id === helper_desc);
    expect(binned?.deleted_at).not.toBeNull();
    expect(binned?.attributes.description).toBe("USER NOTE on helper");
  });
});
