/**
 * The stale-flow sweep and the test-entrypoint consistency contract, in memory: a hand-built
 * `CallGraph` (one product entrypoint, one test entrypoint reaching it) and pre-seeded persisted
 * flows drive `reconcile()` end to end over a `:memory:` store. The fixture repo root (`/repo`)
 * does not exist on disk, so a stored seed file is "absent" by default — the genuine-deletion
 * shape; tests needing a present file point `repo_root_abs` at a real tmpdir.
 */

import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { open_graph_store } from "@code-charter/core";
import type { GraphStore } from "@code-charter/core";

import { read_persisted_flows, skill_flow_id, write_flow } from "./flow_store";
import { reconcile } from "./reconcile";
import type { ReconcileDeps, ReconcileResult } from "./types";
import { anchored_of, id_of, make_adapter, make_deps, make_graph } from "./__fixtures__/agentic_graph";
import type { NodeSpec } from "./__fixtures__/agentic_graph";

const FEATURE: NodeSpec = { file: "feature.ts", name: "feature" };
const TEST_ENTRY: NodeSpec = {
  file: "feature.test.ts",
  name: "t_feature",
  is_test: true,
  calls: [{ to: [id_of(FEATURE)] }],
};
const FEATURE_ID = id_of(FEATURE);
const TEST_ID = id_of(TEST_ENTRY);
const GONE_ID = "gone.ts#gone:function";
const SKILL_ID = skill_flow_id("myskill");

let store: GraphStore;
let logs: string[];

beforeEach(() => {
  store = open_graph_store(":memory:");
  logs = [];
});

afterEach(() => {
  store.close();
});

function deps_over(graph = make_graph([FEATURE, TEST_ENTRY], [FEATURE, TEST_ENTRY])): ReconcileDeps {
  return make_deps(store, make_adapter(graph), (message) => logs.push(message));
}

function seed_code_flow(id: string, anchor_set: string[] = [id]): void {
  write_flow(store, {
    id,
    label: id,
    seed_paths: [id],
    member_ids: [],
    rationale: "",
    anchor_set,
    last_synced_at: "2025-12-01T00:00:00.000Z",
  });
}

function seed_skill_flow(over: { skill_root?: string } = {}): void {
  write_flow(store, {
    id: SKILL_ID,
    label: "myskill",
    seed_paths: ["myskill/SKILL.md#doc"],
    member_ids: ["myskill/SKILL.md#doc"],
    rationale: "",
    anchor_set: ["myskill/SKILL.md#doc"],
    last_synced_at: "2025-12-01T00:00:00.000Z",
    ...over,
  });
}

function live_ids(): string[] {
  return read_persisted_flows(store).map((flow) => flow.node.id);
}

function records_for(result: ReconcileResult, flow_id: string): ReconcileResult["outcomes"] {
  return result.outcomes.filter((outcome) => outcome.flow_id === flow_id);
}

describe("test-entrypoint consistency (AC#1)", () => {
  it("does not hydrate a test-rooted entrypoint whose tree reaches a changed product file", async () => {
    const result = await reconcile(["feature.ts"], deps_over());

    expect(live_ids()).toEqual([FEATURE_ID]); // the product flow hydrates; the test tree does not
    expect(records_for(result, TEST_ID)).toEqual([]);
  });

  it("retires a persisted test-rooted flow via the sweep instead of re-syncing it when its file drifts", async () => {
    // A stale anchor_set would fire 3b's membership-drift trigger; the test-rooted exclusion must
    // route the flow to the sweep instead, or the resync would keep the clutter alive.
    seed_code_flow(TEST_ID, [TEST_ID]);

    const result = await reconcile(["feature.test.ts"], deps_over());

    expect(records_for(result, TEST_ID)).toEqual([
      expect.objectContaining({ action: "retire", kind: "code", reason: expect.stringContaining("test-rooted") }),
    ]);
    expect(live_ids()).not.toContain(TEST_ID);
  });

  it("retires a persisted test-rooted flow on an unrelated turn even though its seed still resolves", async () => {
    seed_code_flow(TEST_ID);

    const result = await reconcile(["notes.md"], deps_over());

    expect(records_for(result, TEST_ID)).toEqual([
      expect.objectContaining({ action: "retire", kind: "code", reason: expect.stringContaining("test-rooted") }),
    ]);
    expect(live_ids()).not.toContain(TEST_ID);
  });
});

describe("stale-flow sweep — code flows (AC#2)", () => {
  it("retires a code flow whose seed no longer resolves, leaving healthy untouched flows alone", async () => {
    const graph = make_graph([FEATURE], [FEATURE]);
    seed_code_flow(GONE_ID);
    seed_code_flow(FEATURE_ID, [FEATURE_ID]); // fresh anchor_set: neither drift trigger fires

    const result = await reconcile(["notes.md"], deps_over(graph));

    expect(records_for(result, GONE_ID)).toEqual([
      expect.objectContaining({ action: "retire", kind: "code", reason: "seed entrypoint gone (deleted or renamed away)" }),
    ]);
    expect(records_for(result, FEATURE_ID)).toEqual([]);
    expect(live_ids()).toEqual([FEATURE_ID]);
  });

  it("skips code flows on an empty call graph", async () => {
    seed_code_flow(GONE_ID);

    const result = await reconcile(["notes.md"], deps_over(make_graph([], [])));

    expect(result.outcomes).toEqual([]);
    expect(result.deferred_retirements).toEqual([]);
    expect(live_ids()).toContain(GONE_ID);
    expect(logs).toContain("stale-flow sweep: code flows skipped (empty call graph)");
  });

  it("defers a seed-gone flow whose file is still on disk, leaving it to the change-scoped pass", async () => {
    // The seed does not resolve but its file survives with other symbols (an out-of-band rename, or
    // a partial parse that dropped just the seed) — ambiguous without a corroborating edit.
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-sweep-"));
    try {
      fs.writeFileSync(path.join(repo, "gone.ts"), "export function renamed() { return 1; }\n");
      seed_code_flow(GONE_ID);
      const graph = make_graph([FEATURE], [FEATURE]);
      const adapter = make_adapter(graph, { anchored: [anchored_of({ file: "gone.ts", name: "renamed" })] });
      const deps = { ...make_deps(store, adapter, (message) => logs.push(message)), repo_root_abs: repo };

      const result = await reconcile(["notes.md"], deps);

      expect(result.outcomes).toEqual([]);
      expect(result.deferred_retirements).toEqual([
        { flow_id: GONE_ID, reason: "seed file still present, seed unresolved: gone.ts (left to the change-scoped pass)" },
      ]);
      expect(live_ids()).toContain(GONE_ID);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("does not judge a partially resolved flow as test-rooted", async () => {
    // Stored seeds: a live test seed + a product seed whose symbol is missing this turn. Judging by
    // resolved seeds alone would read the flow as all-test and destroy it on degraded evidence.
    write_flow(store, {
      id: "prod.ts#gone_entry:function",
      label: "mixed",
      seed_paths: ["prod.ts#gone_entry:function", TEST_ID],
      member_ids: [],
      rationale: "",
      // Matches the resolvable seed's induced membership, so the scoped resync pass sees no drift
      // and the sweep alone judges the flow.
      anchor_set: [FEATURE_ID, TEST_ID].sort(),
      last_synced_at: "2025-12-01T00:00:00.000Z",
    });
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-sweep-"));
    try {
      fs.writeFileSync(path.join(repo, "prod.ts"), "export function other() { return 1; }\n");
      const graph = make_graph([FEATURE, TEST_ENTRY], [FEATURE, TEST_ENTRY]);
      const adapter = make_adapter(graph, { anchored: [anchored_of({ file: "prod.ts", name: "other" })] });
      const deps = { ...make_deps(store, adapter, (message) => logs.push(message)), repo_root_abs: repo };

      const result = await reconcile(["notes.md"], deps);

      expect(result.outcomes).toEqual([]);
      expect(live_ids()).toContain("prod.ts#gone_entry:function");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("defers a seed-gone flow whose seed file was omitted from the graph", async () => {
    seed_code_flow(GONE_ID);
    const deps = deps_over(make_graph([FEATURE], [FEATURE]));
    deps.adapter = { ...deps.adapter, omitted_files: () => new Set(["gone.ts"]) };

    const result = await reconcile(["notes.md"], deps);

    expect(result.outcomes).toEqual([]);
    expect(result.deferred_retirements).toEqual([{ flow_id: GONE_ID, reason: "seed file omitted from graph: gone.ts" }]);
    expect(live_ids()).toContain(GONE_ID);
  });

  it("defers a seed-gone flow whose seed file is present but yields no indexed symbols", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-sweep-"));
    try {
      fs.writeFileSync(path.join(repo, "gone.ts"), "syntax error mid-edit");
      seed_code_flow(GONE_ID);
      const deps = { ...deps_over(make_graph([FEATURE], [FEATURE])), repo_root_abs: repo };

      const result = await reconcile(["notes.md"], deps);

      expect(result.outcomes).toEqual([]);
      expect(result.deferred_retirements).toEqual([
        { flow_id: GONE_ID, reason: "seed file present but yields no indexed symbols: gone.ts" },
      ]);
      expect(live_ids()).toContain(GONE_ID);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("defers a seed-gone flow whose seed file is unreadable rather than retiring on ambiguous evidence", async () => {
    // A real EACCES: the seed file sits in a directory stat cannot traverse. Root ignores modes, so
    // the test degenerates there — skip rather than assert the wrong branch.
    if (process.getuid?.() === 0) return;
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-sweep-"));
    const locked = path.join(repo, "locked");
    try {
      fs.mkdirSync(locked);
      fs.writeFileSync(path.join(locked, "gone.ts"), "export function gone() {}\n");
      fs.chmodSync(locked, 0o000);
      const gone_id = "locked/gone.ts#gone:function";
      seed_code_flow(gone_id);
      const deps = { ...deps_over(make_graph([FEATURE], [FEATURE])), repo_root_abs: repo };

      const result = await reconcile(["notes.md"], deps);

      expect(result.outcomes).toEqual([]);
      expect(result.deferred_retirements).toEqual([{ flow_id: gone_id, reason: "seed file unreadable: locked/gone.ts" }]);
      expect(live_ids()).toContain(gone_id);
    } finally {
      fs.chmodSync(locked, 0o755);
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("does not duplicate a deferral the scoped pass already recorded this turn", async () => {
    seed_code_flow(GONE_ID);
    const deps = deps_over(make_graph([FEATURE], [FEATURE]));
    deps.adapter = { ...deps.adapter, omitted_files: () => new Set(["gone.ts"]) };

    // gone.ts is in the changed set, so 3b surfaces and defers the flow; the sweep must not re-defer.
    const result = await reconcile(["gone.ts"], deps);

    expect(result.deferred_retirements).toEqual([{ flow_id: GONE_ID, reason: "seed file omitted from graph: gone.ts" }]);
  });

  it("retires a seed-gone flow whose file is in the changed set exactly once (the scoped pass owns it)", async () => {
    seed_code_flow(GONE_ID);

    const result = await reconcile(["gone.ts"], deps_over(make_graph([FEATURE], [FEATURE])));

    expect(records_for(result, GONE_ID)).toEqual([expect.objectContaining({ action: "retire", kind: "code" })]);
    expect(live_ids()).not.toContain(GONE_ID);
  });

  it("re-running the turn after a sweep retirement is a no-op", async () => {
    seed_code_flow(GONE_ID);
    const deps = deps_over(make_graph([FEATURE], [FEATURE]));
    await reconcile(["notes.md"], deps);

    const rerun = await reconcile(["notes.md"], deps);

    expect(rerun.outcomes).toEqual([]);
    expect(rerun.deferred_retirements).toEqual([]);
  });
});

describe("stale-flow sweep — skill flows (AC#2)", () => {
  it("retires a skill flow whose SKILL.md is gone from disk", async () => {
    seed_skill_flow({ skill_root: "myskill" });

    const result = await reconcile(["notes.md"], deps_over(make_graph([FEATURE], [FEATURE])));

    expect(records_for(result, SKILL_ID)).toEqual([
      expect.objectContaining({ action: "retire", kind: "skill", reason: "skill bundle deleted (myskill/SKILL.md gone)" }),
    ]);
    expect(live_ids()).not.toContain(SKILL_ID);
  });

  it("leaves a skill flow alone while its SKILL.md exists on disk", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-sweep-"));
    try {
      fs.mkdirSync(path.join(repo, "myskill"));
      fs.writeFileSync(path.join(repo, "myskill", "SKILL.md"), "# My Skill\n");
      seed_skill_flow({ skill_root: "myskill" });
      const deps = { ...deps_over(make_graph([FEATURE], [FEATURE])), repo_root_abs: repo };

      const result = await reconcile(["notes.md"], deps);

      expect(records_for(result, SKILL_ID)).toEqual([]);
      expect(live_ids()).toContain(SKILL_ID);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("retires a deleted skill flow even when the call graph is empty (a skills-only repo)", async () => {
    seed_skill_flow({ skill_root: "myskill" });

    const result = await reconcile(["notes.md"], deps_over(make_graph([], [])));

    expect(records_for(result, SKILL_ID)).toEqual([expect.objectContaining({ action: "retire", kind: "skill" })]);
    expect(live_ids()).not.toContain(SKILL_ID);
  });

  it("defers a skill flow whose bundle root is unreadable rather than retiring on ambiguous evidence", async () => {
    if (process.getuid?.() === 0) return; // root ignores modes; the EACCES branch is unreachable
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-sweep-"));
    const locked = path.join(repo, "locked");
    try {
      fs.mkdirSync(path.join(locked, "myskill"), { recursive: true });
      fs.writeFileSync(path.join(locked, "myskill", "SKILL.md"), "# My Skill\n");
      fs.chmodSync(locked, 0o000);
      seed_skill_flow({ skill_root: "locked/myskill" });
      const deps = { ...deps_over(make_graph([FEATURE], [FEATURE])), repo_root_abs: repo };

      const result = await reconcile(["notes.md"], deps);

      expect(result.outcomes).toEqual([]);
      expect(result.deferred_retirements).toEqual([{ flow_id: SKILL_ID, reason: "skill bundle root unreadable: locked/myskill" }]);
      expect(live_ids()).toContain(SKILL_ID);
    } finally {
      fs.chmodSync(locked, 0o755);
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("leaves a skill flow with no stored skill_root live, logging that it is not sweepable", async () => {
    seed_skill_flow(); // legacy shape: the attribute was never stamped

    const result = await reconcile(["notes.md"], deps_over(make_graph([FEATURE], [FEATURE])));

    expect(records_for(result, SKILL_ID)).toEqual([]);
    expect(live_ids()).toContain(SKILL_ID);
    expect(logs.some((message) => message.includes(SKILL_ID) && message.includes("no skill_root"))).toBe(true);
  });
});
