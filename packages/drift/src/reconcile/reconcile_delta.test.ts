import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { DESCRIPTION_NODE_KIND, open_graph_store, outstanding_drift, type GraphStore } from "@code-charter/core";

import { make_ariadne_adapter } from "./ariadne_adapter";
import { HeadlessProject } from "./headless_project";
import { read_persisted_flow, read_persisted_flows } from "./flow_store";
import { reconcile } from "./reconcile";
import type { ReconcileDeps } from "./types";

/**
 * task-27.1.6.4 AC#2/#3/#4/#7 — symbol-level change-detection scoping through the full headless path.
 * One test per delta class (add / remove / body-modify / relocate / no-op), asserting precise re-sync
 * scoping (only flows whose body or membership drifted) and precise re-describe scoping (only changed
 * symbols re-described, unchanged descriptions byte-identical).
 */

const FLOW_ID = "main.ts#main:function";

/** main → alpha, beta: a seed reaching two leaves, so per-member effects can be isolated. */
const BASE =
  [
    "export function main() {\n  return alpha(1) + beta(2);\n}",
    "export function alpha(n: number) {\n  return n + 1;\n}",
    "export function beta(n: number) {\n  return n + 2;\n}",
  ].join("\n\n") + "\n";

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

/** The `{description, description_hash}` of a member's description node (or undefined if absent/live-deleted). */
function desc_attrs(symbol_path: string): { description: unknown; description_hash: unknown } | undefined {
  const node = store.node(`${DESCRIPTION_NODE_KIND}:${symbol_path}`);
  if (node === undefined) return undefined;
  return { description: node.attributes.description, description_hash: node.attributes.description_hash };
}

/** The flow node's `last_synced_at` — advances on any re-sync (the monotonic clock makes a write detectable). */
function flow_sync(flow_id = FLOW_ID): string {
  return read_persisted_flow(store, flow_id)!.node.attributes.last_synced_at as string;
}

function anchor_set(flow_id = FLOW_ID): string[] {
  return read_persisted_flow(store, flow_id)!.node.attributes.anchor_set as string[];
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-delta-"));
  store = open_graph_store(path.join(repo, "graph.db"));
  clock = 0;
  write("main.ts", BASE);
});

afterEach(() => {
  store.close();
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("reconcile — symbol-level delta scoping (AC#2/#3/#4/#7)", () => {
  it("add: a new member reachable from the seed re-syncs the flow and describes only the new symbol", async () => {
    await run(["main.ts"]);
    const before = flow_sync();
    const before_beta = desc_attrs("main.ts#beta:function");

    const v2 =
      [
        "export function main() {\n  return alpha(1) + beta(2) + gamma(3);\n}",
        "export function alpha(n: number) {\n  return n + 1;\n}",
        "export function beta(n: number) {\n  return n + 2;\n}",
        "export function gamma(n: number) {\n  return n + 3;\n}",
      ].join("\n\n") + "\n";
    write("main.ts", v2);
    await run(["main.ts"]);

    expect(flow_sync() > before).toBe(true); // flow re-synced (membership grew)
    expect(anchor_set()).toContain("main.ts#gamma:function"); // new member induced
    expect(desc_attrs("main.ts#gamma:function")?.description_hash).toBeDefined(); // new member described
    // beta did not change → its description is left exactly as-is.
    expect(desc_attrs("main.ts#beta:function")).toEqual(before_beta);
  });

  it("remove: a deleted leaf re-syncs the flow and drops the stale member", async () => {
    await run(["main.ts"]);
    const before = flow_sync();
    expect(anchor_set()).toContain("main.ts#beta:function");

    const v2 =
      [
        "export function main() {\n  return alpha(1);\n}",
        "export function alpha(n: number) {\n  return n + 1;\n}",
      ].join("\n\n") + "\n";
    write("main.ts", v2);
    await run(["main.ts"]);

    expect(flow_sync() > before).toBe(true); // flow re-synced (membership shrank)
    expect(anchor_set()).not.toContain("main.ts#beta:function"); // stale member dropped
    // beta's description is no longer live (its symbol was removed).
    expect(store.node(`${DESCRIPTION_NODE_KIND}:main.ts#beta:function`)).toBeUndefined();
  });

  it("body-modify: only the changed member re-describes; unchanged members stay byte-identical", async () => {
    await run(["main.ts"]);
    const before_sync = flow_sync();
    const before_alpha = desc_attrs("main.ts#alpha:function");
    const before_beta = desc_attrs("main.ts#beta:function");
    const before_main = desc_attrs("main.ts#main:function");

    // Change only alpha's body — stable symbol_path, new content_hash.
    const v2 = BASE.replace("return n + 1;", "return n + 1000;");
    write("main.ts", v2);
    await run(["main.ts"]);

    expect(flow_sync() > before_sync).toBe(true); // flow re-synced (alpha is a member)
    // alpha re-described: its content_hash changed → the describe-step cache missed → new description_hash.
    expect(desc_attrs("main.ts#alpha:function")?.description_hash).not.toEqual(before_alpha?.description_hash);
    // beta and main did not change → their descriptions are left exactly as-is.
    expect(desc_attrs("main.ts#beta:function")).toEqual(before_beta);
    expect(desc_attrs("main.ts#main:function")).toEqual(before_main);
  });

  it("relocate: a renamed member (stable body) rides the resolver as staged drift, re-syncing the flow", async () => {
    await run(["main.ts"]);
    const before = flow_sync();

    // Rename beta → beta_renamed with an identical body (stable content_hash ⇒ the resolver's relocated verdict).
    const v2 = BASE.replace(/beta/g, "beta_renamed");
    write("main.ts", v2);
    await run(["main.ts"]);

    expect(flow_sync() > before).toBe(true); // flow re-synced (member symbol_path changed)
    // The move is carried via the resolver: the old description's anchor is staged as outstanding drift
    // onto the new symbol_path, rather than the description being regenerated from scratch.
    const drift = outstanding_drift(store);
    const relocated = drift.find((d) => d.to_symbol_path === "main.ts#beta_renamed:function");
    expect(relocated).toBeDefined();
    expect(relocated!.node_id).toBe(`${DESCRIPTION_NODE_KIND}:main.ts#beta:function`);
    // AC#3: the relocated symbol is NOT re-described — no fresh description node at the new path; the
    // carried description (still on the old-path node, staged) is the single source until drift.resolve.
    expect(store.node(`${DESCRIPTION_NODE_KIND}:main.ts#beta_renamed:function`)).toBeUndefined();
  });

  it("no-op: a whitespace/comment edit that changes no member body reconciles nothing (AC#4)", async () => {
    await run(["main.ts"]);
    const before_sync = flow_sync();
    const before = {
      main: desc_attrs("main.ts#main:function"),
      alpha: desc_attrs("main.ts#alpha:function"),
      beta: desc_attrs("main.ts#beta:function"),
    };

    // A leading comment shifts every line down but changes no symbol's body text → empty delta.
    write("main.ts", "// a header comment, semantically inert\n\n" + BASE);
    await run(["main.ts"]);

    expect(flow_sync()).toBe(before_sync); // no re-sync, no last_synced_at churn
    expect(desc_attrs("main.ts#main:function")).toEqual(before.main);
    expect(desc_attrs("main.ts#alpha:function")).toEqual(before.alpha);
    expect(desc_attrs("main.ts#beta:function")).toEqual(before.beta);
  });

  it("scopes by symbol, not file: an unrelated new symbol in a flow's file does not re-sync the flow (AC#2)", async () => {
    await run(["main.ts"]);
    const before = flow_sync();

    // Add an orphan function the flow never reaches; main's body and membership are unchanged.
    write("main.ts", BASE + "\nexport function orphan() {\n  return 0;\n}\n");
    await run(["main.ts"]);

    // The original flow is untouched even though its defining file was edited.
    expect(flow_sync()).toBe(before);
    // The orphan forms its own flow — it is detected, not folded into main's.
    const ids = read_persisted_flows(store).map((f) => f.node.id);
    expect(ids).toContain(FLOW_ID);
    expect(ids).toContain("main.ts#orphan:function");
  });

  it("leaves an existing skill (doc) flow untouched on an unrelated code edit (seeds=∅ skip)", async () => {
    // A skill flow has no live code seed; the symbol-level code trigger must never strand or churn it.
    write("myskill/SKILL.md", "---\nname: myskill\ndescription: test skill\n---\n\n# My Skill\n\nBody.\n");
    await run(["main.ts"]);
    await run(["myskill/SKILL.md"]);
    const skill_id = "agentic.flow:skill:myskill";
    const skill_before = flow_sync(skill_id);

    // Edit a code symbol in an unrelated file — the skill flow must not re-sync, churn, or strand.
    write("main.ts", BASE.replace("return n + 1;", "return n + 11;"));
    await run(["main.ts"]);

    expect(flow_sync(skill_id)).toBe(skill_before); // no churn
    expect(read_persisted_flows(store).map((f) => f.node.id)).toContain(skill_id); // still live
  });

  it("membership drift alone re-syncs a flow: a cross-file member deleted without editing its caller", async () => {
    // The membership-drift trigger (b) must fire independently of the body-drift trigger (a). main (in
    // app.ts) calls leaf (in lib.ts); deleting leaf — WITHOUT touching app.ts — changes no persisted
    // member's body (delta.modified is empty for this turn), yet the flow's induced member set shrinks.
    write("app.ts", "import { leaf } from './lib';\n\nexport function app_main() {\n  return leaf();\n}\n");
    write("lib.ts", "export function leaf() {\n  return 1;\n}\n");
    await run(["app.ts", "lib.ts"]);
    const flow_id = "app.ts#app_main:function";
    const before = flow_sync(flow_id);
    expect(anchor_set(flow_id)).toContain("lib.ts#leaf:function");

    // Delete leaf from lib.ts only; app.ts (the caller) is untouched, so no member body changed.
    write("lib.ts", "export function other() {\n  return 2;\n}\n");
    await run(["lib.ts"]);

    expect(flow_sync(flow_id) > before).toBe(true); // (b) fired despite (a) being empty
    expect(anchor_set(flow_id)).not.toContain("lib.ts#leaf:function"); // stale member dropped
  });
});
