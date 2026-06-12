/**
 * Tier 1 of the stitch eval harness (task-27.1.6.7): the deterministic, no-model contract the live
 * agent depends on, proven over the committed mini-codebase fixtures in `__fixtures__/stitch_eval/`.
 * Each fixture is one Ariadne resolution weakness (its manifest comment names it); the built
 * `drift-reconcile` bin is spawned over a tmp copy — per-process isolation, the full CLI contract —
 * and golden wire JSON stands in for the agent's judgement, exactly as in reconcile_stitch.test.ts.
 * Tier 2 (`stitch_eval` script) drives the real agent over the same fixtures and scores it.
 * Requires the package to be built (turbo `test` depends on it).
 */

import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { BRIDGE_CONFIDENCE_INFERRED, BRIDGE_EDGE_KIND, FLOW_NODE_KIND, open_graph_store } from "@code-charter/core";

const BIN = path.resolve(__dirname, "..", "..", "dist", "bin", "drift_reconcile.js");
const FIXTURES = path.resolve(__dirname, "__fixtures__", "stitch_eval");

let repo: string;

/**
 * Copy a committed fixture into a fresh tmp repo: the bin writes `graph.db` and the payload JSONs
 * land beside it, so the committed tree stays pristine — and the fixture dir is the whole
 * `--repo-root`, so sibling weaknesses never leak into the inventory.
 */
function stage_fixture(name: string): void {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), `stitch-eval-${name}-`));
  fs.cpSync(path.join(FIXTURES, name), repo, { recursive: true });
}

function run(args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(
    "node",
    [BIN, ...args, "--store", path.join(repo, "graph.db"), "--repo-root", repo],
    { encoding: "utf8" },
  );
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

function write_payload(name: string, payload: unknown): string {
  const file = path.join(repo, name);
  fs.writeFileSync(file, JSON.stringify(payload));
  return file;
}

/** Live flow ids + bridge edges read back from the store (the post-run ground truth). */
function read_store(): { flow_ids: string[]; bridges: Array<{ src_id: string; dst_id: string; confidence: number }> } {
  const store = open_graph_store(path.join(repo, "graph.db"));
  try {
    const flow_ids = store
      .all_nodes()
      .filter((n) => n.kind === FLOW_NODE_KIND && n.deleted_at === null)
      .map((n) => n.id)
      .sort();
    const bridges = store
      .all_edges()
      .filter((e) => e.kind === BRIDGE_EDGE_KIND && e.deleted_at === null)
      .map((e) => ({ src_id: e.src_id, dst_id: e.dst_id, confidence: e.confidence }));
    return { flow_ids, bridges };
  } finally {
    store.close();
  }
}

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("stitch eval fixture: dynamic_key_dispatch (TypeScript)", () => {
  const FILES = "create_handler.ts,delete_handler.ts,dispatcher.ts,registry.ts";
  const GOLDEN_UMBRELLAS = {
    umbrellas: [
      {
        label: "action dispatch flow",
        seeds: [
          "create_handler.ts#handle_create:function",
          "delete_handler.ts#handle_delete:function",
          "dispatcher.ts#dispatch:function",
        ],
        bridges: [
          {
            src_id: "dispatcher.ts#dispatch:function",
            dst_id: "create_handler.ts#handle_create:function",
            file: "dispatcher.ts",
            line: 12,
            rationale: "fn() is the registry-looked-up handler; handle_create is registered under the create key",
          },
          {
            src_id: "dispatcher.ts#dispatch:function",
            dst_id: "delete_handler.ts#handle_delete:function",
            file: "dispatcher.ts",
            line: 12,
            rationale: "fn() is the registry-looked-up handler; handle_delete is registered under the delete key",
          },
        ],
        rationale: "dispatch reaches the handlers through the lookup_handler registry",
      },
    ],
  };

  beforeEach(() => stage_fixture("dynamic_key_dispatch"));

  // Structural, positive (AC#2): the weakness fragments — dispatcher + each handler is its own
  // orphan entrypoint, and the dispatcher's tree carries the unresolved registry-lookup call.
  it("--list-entrypoints: three orphan fragments, the dispatcher carrying the unresolved fn() site", () => {
    const result = run(["--list-entrypoints", "--files", FILES]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      entrypoints: [
        {
          symbol_path: "create_handler.ts#handle_create:function",
          name: "handle_create",
          file: "create_handler.ts",
          line: 2,
          is_orphan: true,
          unresolved_sites: [],
        },
        {
          symbol_path: "delete_handler.ts#handle_delete:function",
          name: "handle_delete",
          file: "delete_handler.ts",
          line: 2,
          is_orphan: true,
          unresolved_sites: [],
        },
        {
          symbol_path: "dispatcher.ts#dispatch:function",
          name: "dispatch",
          file: "dispatcher.ts",
          line: 10,
          is_orphan: true,
          unresolved_sites: [{ file: "dispatcher.ts", line: 12, source_line: "return fn();" }],
        },
      ],
    });
    // The deterministic reconcile rode the list pass: each fragment hydrated as a singleton flow.
    expect(read_store().flow_ids).toEqual([
      "create_handler.ts#handle_create:function",
      "delete_handler.ts#handle_delete:function",
      "dispatcher.ts#dispatch:function",
    ]);
  });

  // Structural replay, positive (AC#3): a golden three-seed umbrella collapses the fragments into
  // one flow whose bridges resolve to the real unresolved call span.
  it("--apply-stitch (golden): one multi-seed umbrella, both bridges corroborated, absorbed singletons retired", () => {
    expect(run(["--list-entrypoints", "--files", FILES]).status).toBe(0);

    const result = run(["--apply-stitch", write_payload("stitch.json", GOLDEN_UMBRELLAS)]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      flows: [
        {
          id: "create_handler.ts#handle_create:function",
          members: [
            { symbol_path: "create_handler.ts#handle_create:function", name: "handle_create" },
            { symbol_path: "delete_handler.ts#handle_delete:function", name: "handle_delete" },
            { symbol_path: "dispatcher.ts#dispatch:function", name: "dispatch" },
            { symbol_path: "registry.ts#lookup_handler:function", name: "lookup_handler" },
          ],
        },
      ],
    });

    const { flow_ids, bridges } = read_store();
    expect(flow_ids).toEqual(["create_handler.ts#handle_create:function"]);
    expect(bridges).toEqual([
      {
        src_id: "dispatcher.ts#dispatch:function",
        dst_id: "create_handler.ts#handle_create:function",
        confidence: BRIDGE_CONFIDENCE_INFERRED,
      },
      {
        src_id: "dispatcher.ts#dispatch:function",
        dst_id: "delete_handler.ts#handle_delete:function",
        confidence: BRIDGE_CONFIDENCE_INFERRED,
      },
    ]);
  });

  // Structural replay, negative (AC#3): with no agent judgement the fragments stay singleton flows.
  it("--apply-stitch (no umbrellas): the orphans stay singleton flows", () => {
    run(["--list-entrypoints", "--files", FILES]);
    const result = run(["--apply-stitch", write_payload("stitch.json", { umbrellas: [] })]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ flows: [] });
    expect(read_store().flow_ids).toEqual([
      "create_handler.ts#handle_create:function",
      "delete_handler.ts#handle_delete:function",
      "dispatcher.ts#dispatch:function",
    ]);
  });
});

describe("stitch eval fixture: untyped_callback_invocation (TypeScript)", () => {
  const FILES = "boot_caller.ts,scheduler.ts,shutdown_caller.ts";
  const GOLDEN_UMBRELLAS = {
    umbrellas: [
      {
        label: "scheduled service lifecycle",
        seeds: ["boot_caller.ts#boot:function", "shutdown_caller.ts#shutdown:function"],
        bridges: [
          {
            src_id: "boot_caller.ts#boot:function",
            dst_id: "shutdown_caller.ts#shutdown:function",
            file: "scheduler.ts",
            line: 9,
            rationale: "run() invokes the callbacks both callers pass to the shared scheduler",
          },
        ],
        rationale: "boot and shutdown wire their named callbacks through the same run_scheduled contract",
      },
    ],
  };

  beforeEach(() => stage_fixture("untyped_callback_invocation"));

  // Structural, positive (AC#2): the weakness fragments — each caller is its own orphan entrypoint
  // and both trees share the scheduler's unresolved parameter invocation as stitch evidence.
  it("--list-entrypoints: two orphan callers, both carrying the shared unresolved run() site", () => {
    const result = run(["--list-entrypoints", "--files", FILES]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      entrypoints: [
        {
          symbol_path: "boot_caller.ts#boot:function",
          name: "boot",
          file: "boot_caller.ts",
          line: 7,
          is_orphan: true,
          unresolved_sites: [{ file: "scheduler.ts", line: 9, source_line: "run();" }],
        },
        {
          symbol_path: "shutdown_caller.ts#shutdown:function",
          name: "shutdown",
          file: "shutdown_caller.ts",
          line: 7,
          is_orphan: true,
          unresolved_sites: [{ file: "scheduler.ts", line: 9, source_line: "run();" }],
        },
      ],
    });
    expect(read_store().flow_ids).toEqual(["boot_caller.ts#boot:function", "shutdown_caller.ts#shutdown:function"]);
  });

  // Structural replay, positive (AC#3): a golden two-seed umbrella merges the callers over the
  // scheduler's unresolved call site; the bridge resolves to the real span.
  it("--apply-stitch (golden): one umbrella over both callers, bridge corroborated at the run() site", () => {
    expect(run(["--list-entrypoints", "--files", FILES]).status).toBe(0);

    const result = run(["--apply-stitch", write_payload("stitch.json", GOLDEN_UMBRELLAS)]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      flows: [
        {
          id: "boot_caller.ts#boot:function",
          members: [
            { symbol_path: "boot_caller.ts#boot:function", name: "boot" },
            { symbol_path: "scheduler.ts#run_scheduled:function", name: "run_scheduled" },
            { symbol_path: "shutdown_caller.ts#shutdown:function", name: "shutdown" },
          ],
        },
      ],
    });

    const { flow_ids, bridges } = read_store();
    expect(flow_ids).toEqual(["boot_caller.ts#boot:function"]);
    expect(bridges).toEqual([
      {
        src_id: "boot_caller.ts#boot:function",
        dst_id: "shutdown_caller.ts#shutdown:function",
        confidence: BRIDGE_CONFIDENCE_INFERRED,
      },
    ]);
  });
});

describe("stitch eval fixture: untyped_receiver_method (Python)", () => {
  const FILES = "caller.py,processor.py";
  // The corroborable unresolved site is the `run_item(Item())` line: Ariadne generates no call node
  // for `item.process()` on the unannotated parameter (which is exactly why the method orphans),
  // so the constructor call line is the bridge evidence the inventory offers.
  const GOLDEN_UMBRELLAS = {
    umbrellas: [
      {
        label: "item processing",
        seeds: ["caller.py#main:function", "processor.py#process:method"],
        bridges: [
          {
            src_id: "caller.py#main:function",
            dst_id: "processor.py#process:method",
            file: "caller.py",
            line: 9,
            rationale: "run_item calls process() on the Item instance main passes in",
          },
        ],
        rationale: "the untyped item parameter hides the call from main's tree into Item.process",
      },
    ],
  };

  beforeEach(() => stage_fixture("untyped_receiver_method"));

  // Structural, positive (AC#2): the weakness fragments — the unannotated receiver orphans the
  // method, and the caller's tree carries unresolved sites. The same site repeats once per
  // unresolved call node Ariadne parses on that line; the inventory does not dedupe.
  it("--list-entrypoints: the caller and the orphaned method fragment, with unresolved sites in the caller's tree", () => {
    const result = run(["--list-entrypoints", "--files", FILES]);
    expect(result.status).toBe(0);
    const site = { file: "caller.py", line: 9, source_line: "return run_item(Item())" };
    expect(JSON.parse(result.stdout)).toEqual({
      entrypoints: [
        {
          symbol_path: "caller.py#main:function",
          name: "main",
          file: "caller.py",
          line: 8,
          is_orphan: true,
          unresolved_sites: [site, site, site],
        },
        {
          symbol_path: "processor.py#process:method",
          name: "process",
          file: "processor.py",
          line: 9,
          is_orphan: true,
          unresolved_sites: [],
        },
      ],
    });
    expect(read_store().flow_ids).toEqual(["caller.py#main:function", "processor.py#process:method"]);
  });

  // Structural replay, positive (AC#3): a golden umbrella stitches the Python fragments; the bridge
  // corroborates at the real unresolved call line and the orphaned method joins the caller's flow.
  it("--apply-stitch (golden): one umbrella spanning caller and method, bridge corroborated", () => {
    expect(run(["--list-entrypoints", "--files", FILES]).status).toBe(0);

    const result = run(["--apply-stitch", write_payload("stitch.json", GOLDEN_UMBRELLAS)]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      flows: [
        {
          id: "caller.py#main:function",
          members: [
            { symbol_path: "caller.py#main:function", name: "main" },
            { symbol_path: "caller.py#run_item:function", name: "run_item" },
            { symbol_path: "processor.py#process:method", name: "process" },
          ],
        },
      ],
    });

    const { flow_ids, bridges } = read_store();
    expect(flow_ids).toEqual(["caller.py#main:function"]);
    expect(bridges).toEqual([
      {
        src_id: "caller.py#main:function",
        dst_id: "processor.py#process:method",
        confidence: BRIDGE_CONFIDENCE_INFERRED,
      },
    ]);
  });

  // Structural replay, positive (AC#3): golden descriptions submitted under the flow-layer member
  // symbol_paths the stitch returned persist on the right rows — the method's row lives under the
  // anchor's enclosing-qualified symbol_path (`Item.process`), the two-id-space join.
  it("--apply-descriptions (golden): persists on each stitched member's anchor symbol_path", () => {
    run(["--list-entrypoints", "--files", FILES]);
    run(["--apply-stitch", write_payload("stitch.json", GOLDEN_UMBRELLAS)]);

    const texts: Record<string, string> = {
      "caller.py#main:function": "Builds an Item and hands it to run_item for processing.",
      "caller.py#run_item:function": "Calls process() on whatever item it is given.",
      "processor.py#process:method": "Performs the item's processing step and returns its result.",
    };
    const result = run([
      "--apply-descriptions",
      write_payload("descriptions.json", {
        descriptions: Object.entries(texts).map(([symbol_path, text]) => ({ symbol_path, text })),
      }),
    ]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ written: Object.keys(texts).sort(), skipped: [] });

    // Wire (flow-layer) path → the anchor symbol_path the row persists under.
    const persisted_under: Record<string, string> = {
      "caller.py#main:function": "caller.py#main:function",
      "caller.py#run_item:function": "caller.py#run_item:function",
      "processor.py#process:method": "processor.py#Item.process:method",
    };
    const store = open_graph_store(path.join(repo, "graph.db"));
    try {
      for (const [wire_path, anchor_path] of Object.entries(persisted_under)) {
        const node = store.all_nodes().find((n) => n.id === `agentic.description:${anchor_path}`);
        expect(node?.attributes.description).toBe(texts[wire_path]);
        expect(node?.attributes.description_source).toBe("llm");
      }
    } finally {
      store.close();
    }
  });
});

describe("stitch eval fixture: control_unrelated_pair (TypeScript)", () => {
  const FILES = "percent.ts,temperature.ts";

  beforeEach(() => stage_fixture("control_unrelated_pair"));

  // Structural, negative (the false-positive guard, AC#2): two genuinely independent entrypoints
  // present no stitch evidence — no unresolved site links them.
  it("--list-entrypoints: two independent entrypoints with no unresolved link between them", () => {
    const result = run(["--list-entrypoints", "--files", FILES]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      entrypoints: [
        {
          symbol_path: "percent.ts#clamp_percent:function",
          name: "clamp_percent",
          file: "percent.ts",
          line: 1,
          is_orphan: true,
          unresolved_sites: [],
        },
        {
          symbol_path: "temperature.ts#to_fahrenheit:function",
          name: "to_fahrenheit",
          file: "temperature.ts",
          line: 8,
          is_orphan: true,
          unresolved_sites: [],
        },
      ],
    });
  });

  // Structural replay, negative (AC#3): declining to stitch is the correct judgement here — the
  // Tier 1 mirror of Tier 2's false-positive guard. Both entrypoints stay singleton flows.
  it("--apply-stitch (no umbrellas): both entrypoints stay singleton flows", () => {
    run(["--list-entrypoints", "--files", FILES]);
    const result = run(["--apply-stitch", write_payload("stitch.json", { umbrellas: [] })]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ flows: [] });
    const { flow_ids, bridges } = read_store();
    expect(flow_ids).toEqual(["percent.ts#clamp_percent:function", "temperature.ts#to_fahrenheit:function"]);
    expect(bridges).toHaveLength(0);
  });
});
