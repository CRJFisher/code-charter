import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  build_resolver_index,
  DESCRIPTION_NODE_KIND,
  FLOW_NODE_KIND,
  open_graph_store,
  type GraphStore,
} from "@code-charter/core";

import { make_ariadne_adapter } from "./ariadne_adapter";
import type { AriadneAdapter } from "./ariadne_adapter";
import { HeadlessProject } from "./headless_project";
import { read_persisted_flow, read_persisted_flows } from "./flow_store";
import { reconcile } from "./reconcile";
import type { ReconcileDeps, ReconcileResult } from "./types";

let repo: string;
let store: GraphStore;
let clock: number;

const MAIN_SRC = "export function main() {\n  return helper(1) + 2;\n}\n\nexport function helper(n: number) {\n  return n + 1;\n}\n";

function write(rel: string, content: string): void {
  const abs = path.join(repo, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

async function run(file_set: string[], adapter?: AriadneAdapter): Promise<ReconcileResult> {
  const project = new HeadlessProject(repo);
  await project.initialize();
  const deps: ReconcileDeps = {
    store,
    adapter: adapter ?? make_ariadne_adapter(project, () => {}),
    repo_root_abs: repo,
    analyzed_root: "",
    now: () => new Date(2026, 0, 1, 0, 0, clock++).toISOString(),
    log: () => {},
  };
  return reconcile(file_set, deps);
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
    // Stamp a distinctive agentic description so a spurious re-describe is detectable: a re-run of the
    // describe step would overwrite this with helper's name placeholder.
    store.write_fields({ kind: "node", id: helper_desc_id }, { description: "DISTINCTIVE" }, "agentic");

    // Re-sync after an unrelated body edit to main; helper's body is unchanged, so the content-hash
    // guard skips re-describing it and write_descriptions never touches its node.
    write("main.ts", MAIN_SRC.replace("+ 2", "+ 3"));
    await run(["main.ts"]);

    expect(store.node(helper_desc_id)?.attributes.description).toBe("DISTINCTIVE");
  });

  it("retires a superseded flow when its entrypoint is renamed, re-hydrating a fresh flow under the new id", async () => {
    const v1 = "export function entry() { return h1() + h2(); }\n\nfunction h1() { return 1; }\n\nfunction h2() { return 2; }\n";
    write("main.ts", v1);
    await run(["main.ts"]);
    const old_id = read_persisted_flows(store)[0].node.id;
    expect(old_id).toContain("entry:function");

    // Rename the entrypoint: the flow id changes, so the old flow is retired and a fresh flow hydrates.
    write("main.ts", v1.replace(/entry/g, "entry_renamed"));
    const result = await run(["main.ts"]);

    const live = read_persisted_flows(store);
    expect(live).toHaveLength(1); // old id superseded, new id is the only live flow
    expect(live[0].node.id).toContain("entry_renamed:function");
    // The old flow is retired (soft-deleted), not left live and stale.
    const old = store.all_nodes({ include_deleted: true }).find((n) => n.id === old_id);
    expect(old?.deleted_at).not.toBeNull();
    // The retirement is a first-class outcome — visible in the result the --json surface serializes.
    expect(result.outcomes).toContainEqual(
      expect.objectContaining({ flow_id: old_id, action: "retire", kind: "code" }),
    );
    expect(result.deferred_retirements).toEqual([]);
  });

  it("retires a superseded flow when a new wrapper demotes its entrypoint — exactly one live flow", async () => {
    const v1 = "export function entry() { return h1() + h2(); }\n\nfunction h1() { return 1; }\n\nfunction h2() { return 2; }\n";
    write("main.ts", v1);
    await run(["main.ts"]);
    expect(read_persisted_flows(store).map((f) => f.node.id)).toEqual(["main.ts#entry:function"]);

    // Wrap the entrypoint: entry still exists (seed-gone never fires) but is demoted to a
    // non-entrypoint, and the wrapper's flow subsumes the old flow's members.
    write("main.ts", "export function wrapper() { return entry(); }\n\n" + v1.replace("export function entry", "function entry"));
    const result = await run(["main.ts"]);

    const live = read_persisted_flows(store);
    expect(live).toHaveLength(1); // the wrapper's superset flow is the only live flow
    expect(live[0].node.id).toBe("main.ts#wrapper:function");
    const old = store.all_nodes({ include_deleted: true }).find((n) => n.id === "main.ts#entry:function");
    expect(old?.deleted_at).not.toBeNull();
    expect(result.outcomes).toContainEqual(
      expect.objectContaining({ flow_id: "main.ts#entry:function", action: "retire" }),
    );
    expect(result.outcomes).toContainEqual(
      expect.objectContaining({ flow_id: "main.ts#wrapper:function", action: "hydrate" }),
    );
  });

  it("does not retire a genuine multi-entrypoint flow whose members are merely shared (negative case)", async () => {
    // Two real entrypoints share `shared`: entry_big's member set subsumes entry_small's, but both
    // remain live entrypoints — subsumption alone must never retire; only demotion + subsumption does.
    const src =
      "export function entry_small() { return shared(1); }\n\n" +
      "export function entry_big() { return shared(2) + other(); }\n\n" +
      "function shared(n: number) { return n; }\n\n" +
      "function other() { return 9; }\n";
    write("app.ts", src);
    await run(["app.ts"]);
    expect(read_persisted_flows(store)).toHaveLength(2);

    // Touch the shared member's body so both flows re-sync (the demotion check runs on each write).
    write("app.ts", src.replace("return n;", "return n + 1;"));
    const result = await run(["app.ts"]);

    expect(result.outcomes.filter((o) => o.action === "retire")).toEqual([]);
    expect(read_persisted_flows(store).map((f) => f.node.id).sort()).toEqual([
      "app.ts#entry_big:function",
      "app.ts#entry_small:function",
    ]);
  });

  it("a flow retired by an earlier 3b resync's demotion check is not resurrected by its own resync", async () => {
    // Two persisted flows; the wrapper's id sorts before the victim's, so in the turn where the
    // wrapper starts calling the victim's entrypoint BOTH are 3b-affected and the wrapper's resync
    // retires the victim before the loop reaches it. The victim's own iteration must be skipped —
    // re-syncing it would upsert the flow node live again (deleted_at: null), undoing the retirement.
    write("a.ts", "export function a_wrapper() {\n  return 0;\n}\n");
    write("m.ts", "export function entry() {\n  return h1();\n}\n\nfunction h1() {\n  return 1;\n}\n");
    await run(["a.ts", "m.ts"]);
    expect(read_persisted_flows(store).map((f) => f.node.id).sort()).toEqual([
      "a.ts#a_wrapper:function",
      "m.ts#entry:function",
    ]);

    // One turn: the wrapper now calls entry (membership drift for the wrapper, demotion for entry)
    // and entry's tree also changes (body drift for the victim) — both land in the same 3b pass.
    write("a.ts", "import { entry } from './m';\n\nexport function a_wrapper() {\n  return entry();\n}\n");
    write("m.ts", "export function entry() {\n  return h1();\n}\n\nfunction h1() {\n  return 1000;\n}\n");
    const result = await run(["a.ts", "m.ts"]);

    expect(read_persisted_flows(store).map((f) => f.node.id)).toEqual(["a.ts#a_wrapper:function"]);
    const victim_records = result.outcomes.filter((o) => o.flow_id === "m.ts#entry:function");
    expect(victim_records).toEqual([expect.objectContaining({ action: "retire" })]);
  });

  it("a deferred retirement completes on a later turn with trustworthy evidence", async () => {
    await run(["main.ts"]);
    const flow_id = read_persisted_flows(store)[0].node.id;

    // Turn 1: main.ts reported omitted → defer.
    write("other.ts", "export function other_entry() { return 3; }\n");
    fs.rmSync(path.join(repo, "main.ts"));
    const project = new HeadlessProject(repo);
    await project.initialize();
    const real = make_ariadne_adapter(project, () => {});
    const omitting_adapter: AriadneAdapter = { ...real, omitted_files: () => new Set(["main.ts"]) };
    const deferred = await run(["main.ts"], omitting_adapter);
    expect(deferred.deferred_retirements).toHaveLength(1);
    expect(read_persisted_flows(store).map((f) => f.node.id)).toContain(flow_id);

    // Turn 2: a healthy run over the same file — the seed file is genuinely gone, so retire.
    const retried = await run(["main.ts"]);
    expect(retried.outcomes).toContainEqual(expect.objectContaining({ flow_id, action: "retire" }));
    expect(read_persisted_flows(store).map((f) => f.node.id)).not.toContain(flow_id);
  });

  it("defers retirement when the seed's file parses to zero symbols (a real mid-edit breakage)", async () => {
    // A healthy sibling keeps the graph non-empty, so the empty-graph guard cannot mask this path.
    write("other.ts", "export function other_entry() { return 3; }\n");
    await run(["main.ts", "other.ts"]);
    const flow_id = "main.ts#main:function";
    expect(read_persisted_flows(store).map((f) => f.node.id)).toContain(flow_id);

    // Genuinely broken source: tree-sitter parses without throwing, but no definition survives, so
    // the file never lands in omitted_files — the zero-symbols guard must catch it instead.
    write("main.ts", "export funct main( {{{\n  retur helper(1\n");
    const result = await run(["main.ts"]);

    expect(result.outcomes.filter((o) => o.action === "retire")).toEqual([]);
    expect(result.deferred_retirements).toContainEqual({
      flow_id,
      reason: "seed file present but yields no indexed symbols: main.ts",
    });
    expect(read_persisted_flows(store).map((f) => f.node.id)).toContain(flow_id);
  });

  it("a same-turn resync of the superseded flow nets out to a single retire record", async () => {
    const v1 = "export function entry() { return h1(); }\n\nfunction h1() { return 1; }\n";
    write("main.ts", v1);
    await run(["main.ts"]);

    // One turn both edits the old flow's member body (firing its 3b resync) and adds the wrapper
    // (firing the demotion check from the wrapper's 3c hydration).
    write(
      "main.ts",
      "export function wrapper() { return entry(); }\n\n" +
        v1.replace("export function entry", "function entry").replace("return 1;", "return 1000;"),
    );
    const result = await run(["main.ts"]);

    const entry_records = result.outcomes.filter((o) => o.flow_id === "main.ts#entry:function");
    expect(entry_records).toEqual([
      expect.objectContaining({ action: "retire" }), // the earlier resync record is dropped
    ]);
    expect(read_persisted_flows(store).map((f) => f.node.id)).toEqual(["main.ts#wrapper:function"]);
  });

  it("scopes seed-gone retirement to the changed set: an unrelated edit never retires another file's flow", async () => {
    write("a.ts", "export function a_entry() { return 1; }\n");
    write("b.ts", "export function b_entry() { return 2; }\n");
    await run(["a.ts", "b.ts"]);
    expect(read_persisted_flows(store).map((f) => f.node.id).sort()).toEqual([
      "a.ts#a_entry:function",
      "b.ts#b_entry:function",
    ]);

    // Rename b's entrypoint on disk, but reconcile only a.ts: b's flow is not implicated this turn,
    // so it must linger live — retirement is on-demand, not a global sweep.
    write("b.ts", "export function b_renamed() { return 2; }\n");
    write("a.ts", "export function a_entry() { return 11; }\n");
    const unrelated = await run(["a.ts"]);
    expect(unrelated.outcomes.filter((o) => o.action === "retire")).toEqual([]);
    expect(read_persisted_flows(store).map((f) => f.node.id)).toContain("b.ts#b_entry:function");

    // The turn that touches b.ts retires it.
    const related = await run(["b.ts"]);
    expect(related.outcomes).toContainEqual(
      expect.objectContaining({ flow_id: "b.ts#b_entry:function", action: "retire" }),
    );
    expect(read_persisted_flows(store).map((f) => f.node.id)).not.toContain("b.ts#b_entry:function");
  });

  it("defers retirement on a degenerate (empty) graph instead of retiring on bad evidence", async () => {
    await run(["main.ts"]);
    const flow_id = read_persisted_flows(store)[0].node.id;

    // An adapter whose graph came back empty (the get_call_graph fallback): nothing resolves, but
    // retiring on that evidence would wipe healthy flows. The retirement defers instead.
    const empty_adapter: AriadneAdapter = {
      call_graph: () => ({ nodes: new Map(), entry_points: [] }),
      extract_raw: () => {},
      build_index: () => build_resolver_index([]),
      anchored_symbols: () => [],
      file_of: () => undefined,
      omitted_files: () => new Set(),
      source_line: () => undefined,
    };
    // Reconcile a non-code path so re_extract is skipped and only the flow-retirement path runs.
    const result = await run(["notes.md"], empty_adapter);

    expect(result.outcomes.filter((o) => o.action === "retire")).toEqual([]);
    expect(read_persisted_flows(store).map((f) => f.node.id)).toContain(flow_id);
    // ... but with the flow's own file in the changed set, the defer is surfaced with its reason.
    const scoped = await run(["main.ts"], empty_adapter);
    expect(scoped.outcomes.filter((o) => o.action === "retire")).toEqual([]);
    expect(scoped.deferred_retirements).toContainEqual({ flow_id, reason: "empty call graph" });
    expect(read_persisted_flows(store).map((f) => f.node.id)).toContain(flow_id);
  });

  it("defers retirement when the seed's file was omitted from the graph (e.g. a mid-edit parse failure)", async () => {
    await run(["main.ts"]);
    const flow_id = read_persisted_flows(store)[0].node.id;

    // Simulate main.ts failing to read/index: the graph is healthy elsewhere (other.ts), but main.ts
    // is reported omitted, so its flow's seed not resolving is untrustworthy evidence.
    write("other.ts", "export function other_entry() { return 3; }\n");
    fs.rmSync(path.join(repo, "main.ts"));
    const project = new HeadlessProject(repo);
    await project.initialize();
    const real = make_ariadne_adapter(project, () => {});
    const omitting_adapter: AriadneAdapter = { ...real, omitted_files: () => new Set(["main.ts"]) };

    const result = await run(["main.ts", "other.ts"], omitting_adapter);

    expect(result.outcomes.filter((o) => o.action === "retire")).toEqual([]);
    expect(result.deferred_retirements).toContainEqual({
      flow_id,
      reason: "seed file omitted from graph: main.ts",
    });
    expect(read_persisted_flows(store).map((f) => f.node.id)).toContain(flow_id);
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
