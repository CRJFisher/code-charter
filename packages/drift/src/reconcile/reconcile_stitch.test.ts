/**
 * The agentic stitch path, proven at the script boundary. The drift-sync skill orchestrates
 * the agent over three bin modes; here golden wire JSON stands in for the agent's judgement and the
 * built `drift-reconcile` bin is spawned over a real on-disk split-entrypoint fixture:
 *
 *   handler.ts#dispatch calls `fn()` — the result of a registry lookup Ariadne cannot resolve — so
 *   router.ts#handle_request (the registered target) is promoted to its own orphan entrypoint and the
 *   functionality fragments into two singleton flows.
 *
 * No executor mock exists: feeding `--apply-stitch` a golden `umbrellas` JSON yields one multi-seed
 * umbrella with the bridge over the missed call; feeding it no umbrellas (or running
 * `--list-entrypoints` alone) leaves the orphans as singleton flows. Requires the package to be built
 * (turbo `test` depends on it).
 */

import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { BRIDGE_CONFIDENCE_INFERRED, BRIDGE_EDGE_KIND, FLOW_NODE_KIND, open_graph_store } from "@code-charter/core";

const BIN = path.resolve(__dirname, "..", "..", "dist", "bin", "drift_reconcile.js");

const HANDLER_TS = [
  'import { route } from "./registry";',
  "",
  "export function dispatch(key: string): number {",
  "  const fn = route(key);",
  "  return fn();",
  "}",
  "",
].join("\n");

const REGISTRY_TS = [
  "const table = new Map<string, () => number>();",
  "export function route(key: string): () => number {",
  "  return table.get(key)!;",
  "}",
  "",
].join("\n");

const ROUTER_TS = ["export function handle_request(): number {", "  return 42;", "}", ""].join("\n");

const FILES = "handler.ts,registry.ts,router.ts";

const GOLDEN_UMBRELLAS = {
  umbrellas: [
    {
      label: "request dispatch flow",
      seeds: ["handler.ts#dispatch:function", "router.ts#handle_request:function"],
      bridges: [
        {
          src_id: "handler.ts#dispatch:function",
          dst_id: "router.ts#handle_request:function",
          file: "handler.ts",
          line: 5,
          rationale: "fn() is the registry-looked-up handler; handle_request is the registered target",
        },
      ],
      rationale: "dispatch reaches handle_request through the route() registry lookup",
    },
  ],
};

let repo: string;

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

/** The full store contents with the wall-clock stamp normalized — the byte-identity comparand. */
function dump_store(): { nodes: unknown[]; edges: unknown[] } {
  const store = open_graph_store(path.join(repo, "graph.db"));
  try {
    const nodes = store
      .all_nodes()
      .map((n) => ({ ...n, attributes: { ...n.attributes, last_synced_at: n.attributes.last_synced_at == null ? null : "<t>" } }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const edges = [...store.all_edges()].sort((a, b) => (a.key < b.key ? -1 : 1));
    return { nodes, edges };
  } finally {
    store.close();
  }
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-stitch-"));
  fs.writeFileSync(path.join(repo, "handler.ts"), HANDLER_TS);
  fs.writeFileSync(path.join(repo, "registry.ts"), REGISTRY_TS);
  fs.writeFileSync(path.join(repo, "router.ts"), ROUTER_TS);
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("drift-reconcile agentic modes — the script boundary", () => {
  it("--list-entrypoints alone: emits the golden inventory and leaves the orphans as singleton flows", () => {
    const result = run(["--list-entrypoints", "--files", FILES]);
    expect(result.status).toBe(0);

    expect(JSON.parse(result.stdout)).toEqual({
      entrypoints: [
        {
          symbol_path: "handler.ts#dispatch:function",
          name: "dispatch",
          file: "handler.ts",
          line: 3,
          is_orphan: true,
          // The same-pass reconcile already hydrated the singletons, so both members carry the
          // provisional name stand-in awaiting the agent's describe phase.
          members: [
            { name: "dispatch", kind: "function" },
            { name: "route", kind: "function" },
          ],
          described_coverage: { docstring: 0, provisional: 2, placeholder: 0, llm: 0 },
          unresolved_sites: [{ file: "handler.ts", line: 5, source_line: "return fn();" }],
        },
        {
          symbol_path: "router.ts#handle_request:function",
          name: "handle_request",
          file: "router.ts",
          line: 1,
          is_orphan: true,
          members: [{ name: "handle_request", kind: "function" }],
          described_coverage: { docstring: 0, provisional: 1, placeholder: 0, llm: 0 },
          unresolved_sites: [],
        },
      ],
    });

    // The deterministic reconcile rode the list pass: both fragments hydrated as singleton flows.
    const { flow_ids, bridges } = read_store();
    expect(flow_ids).toEqual(["handler.ts#dispatch:function", "router.ts#handle_request:function"]);
    expect(bridges).toHaveLength(0);
  });

  it("--list-entrypoints is byte-identical to the default deterministic reconcile", () => {
    const from_list = run(["--list-entrypoints", "--files", FILES]);
    expect(from_list.status).toBe(0);
    const list_store = dump_store();

    fs.rmSync(path.join(repo, "graph.db"), { force: true });
    const from_default = run(["--files", FILES, "--json"]);
    expect(from_default.status).toBe(0);

    expect(dump_store()).toEqual(list_store);
  });

  it("golden umbrellas JSON: one multi-seed umbrella with the bridge over the missed call, absorbed singleton retired", () => {
    expect(run(["--list-entrypoints", "--files", FILES]).status).toBe(0);

    const result = run(["--apply-stitch", write_payload("stitch.json", GOLDEN_UMBRELLAS)]);
    expect(result.status).toBe(0);

    // The returned flow shape feeds phase 2: dominant-seed id + the full induced member set.
    expect(JSON.parse(result.stdout)).toEqual({
      flows: [
        {
          id: "handler.ts#dispatch:function",
          members: [
            { symbol_path: "handler.ts#dispatch:function", name: "dispatch" },
            { symbol_path: "registry.ts#route:function", name: "route" },
            { symbol_path: "router.ts#handle_request:function", name: "handle_request" },
          ],
        },
      ],
    });

    const { flow_ids, bridges } = read_store();
    expect(flow_ids).toEqual(["handler.ts#dispatch:function"]); // the absorbed singleton retired
    expect(bridges).toEqual([
      {
        src_id: "handler.ts#dispatch:function",
        dst_id: "router.ts#handle_request:function",
        confidence: BRIDGE_CONFIDENCE_INFERRED,
      },
    ]);
    expect(result.stderr).toContain("retired singleton flow router.ts#handle_request:function");
  });

  it("a stitched umbrella survives the next deterministic pass: the absorbed singleton stays retired", () => {
    run(["--list-entrypoints", "--files", FILES]);
    run(["--apply-stitch", write_payload("stitch.json", GOLDEN_UMBRELLAS)]);
    const stitched = read_store();
    expect(stitched.flow_ids).toEqual(["handler.ts#dispatch:function"]);

    // The next turn touches the absorbed fragment's file. Its entrypoint is still a live graph
    // entrypoint (bridges never enter the syntactic graph), but it is a stored seed of the live
    // umbrella — step 3c must not re-promote it to a singleton flow.
    fs.appendFileSync(path.join(repo, "router.ts"), "// touched\n");
    const next = run(["--list-entrypoints", "--files", "router.ts"]);
    expect(next.status).toBe(0);

    const { flow_ids, bridges } = read_store();
    expect(flow_ids).toEqual(["handler.ts#dispatch:function"]); // no resurrection
    expect(bridges).toHaveLength(1); // the stitch's provenance record survives the resync
  });

  it("--apply-stitch rejects a bridge whose claimed call site the graph cannot corroborate", () => {
    run(["--list-entrypoints", "--files", FILES]);

    const result = run([
      "--apply-stitch",
      write_payload("stitch.json", {
        umbrellas: [
          {
            ...GOLDEN_UMBRELLAS.umbrellas[0],
            bridges: [{ ...GOLDEN_UMBRELLAS.umbrellas[0].bridges[0], line: 2 }], // line 2 holds no unresolved call
          },
        ],
      }),
    ]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("no unresolved call at handler.ts:2, bridge skipped");

    const { flow_ids, bridges } = read_store();
    expect(flow_ids).toEqual(["handler.ts#dispatch:function"]); // the umbrella still merges
    expect(bridges).toHaveLength(0); // but the uncorroborated bridge never persists
  });

  it("--apply-stitch is idempotent: a re-run with identical input changes nothing", () => {
    run(["--list-entrypoints", "--files", FILES]);
    const payload = write_payload("stitch.json", GOLDEN_UMBRELLAS);
    expect(run(["--apply-stitch", payload]).status).toBe(0);
    const first = read_store();

    const second = run(["--apply-stitch", payload]);
    expect(second.status).toBe(0);
    expect(read_store()).toEqual(first);
  });

  it("no umbrellas: a clean no-op, the orphans stay singleton flows", () => {
    run(["--list-entrypoints", "--files", FILES]);

    const result = run(["--apply-stitch", write_payload("stitch.json", { umbrellas: [] })]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ flows: [] });

    const { flow_ids, bridges } = read_store();
    expect(flow_ids).toEqual(["handler.ts#dispatch:function", "router.ts#handle_request:function"]);
    expect(bridges).toHaveLength(0);
  });

  it("garbage content is skipped with a diagnostic, never a crash: unknown seeds drop, the rest apply", () => {
    run(["--list-entrypoints", "--files", FILES]);

    const result = run([
      "--apply-stitch",
      write_payload("stitch.json", {
        umbrellas: [
          { label: "ghost", seeds: ["nowhere.ts#missing:function"], rationale: "hallucinated" },
          ...GOLDEN_UMBRELLAS.umbrellas,
        ],
      }),
    ]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("seed not in the live graph, skipped: nowhere.ts#missing:function");
    expect(JSON.parse(result.stdout).flows).toHaveLength(1);
    expect(read_store().flow_ids).toEqual(["handler.ts#dispatch:function"]);
  });

  it("a seed claimed by an earlier umbrella is not double-claimed: the later umbrella drops it", () => {
    run(["--list-entrypoints", "--files", FILES]);

    const result = run([
      "--apply-stitch",
      write_payload("stitch.json", {
        umbrellas: [
          GOLDEN_UMBRELLAS.umbrellas[0],
          { label: "second claimant", seeds: ["router.ts#handle_request:function"], rationale: "wants the same seed" },
        ],
      }),
    ]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain(
      "seed already claimed by an earlier umbrella, skipped: router.ts#handle_request:function",
    );
    expect(result.stderr).toContain("umbrella 'second claimant' has no resolvable seeds, skipped");

    expect(JSON.parse(result.stdout).flows).toHaveLength(1);
    expect(read_store().flow_ids).toEqual(["handler.ts#dispatch:function"]);
  });

  it("malformed wire JSON is a contract error: exit 2, store untouched", () => {
    run(["--list-entrypoints", "--files", FILES]);
    const before = read_store();

    const result = run(["--apply-stitch", write_payload("stitch.json", { umbrellas: [{ label: 1 }] })]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("invalid --apply-stitch payload");
    expect(read_store()).toEqual(before);
  });

  it("--apply-descriptions persists agent text through the scoped path and cache-skips an unchanged member", () => {
    run(["--list-entrypoints", "--files", FILES]);
    run(["--apply-stitch", write_payload("stitch.json", GOLDEN_UMBRELLAS)]);

    const payload = write_payload("descriptions.json", {
      descriptions: [
        { symbol_path: "handler.ts#dispatch:function", text: "Looks up the registered handler for a key and runs it." },
        { symbol_path: "ghost.ts#nope:function", text: "no anchor" },
      ],
    });
    const first = run(["--apply-descriptions", payload]);
    expect(first.status).toBe(0);
    expect(JSON.parse(first.stdout)).toEqual({
      written: ["handler.ts#dispatch:function"],
      skipped: ["ghost.ts#nope:function"],
    });

    const store = open_graph_store(path.join(repo, "graph.db"));
    try {
      const node = store.all_nodes().find((n) => n.id === "agentic.description:handler.ts#dispatch:function");
      expect(node?.attributes.description).toBe("Looks up the registered handler for a key and runs it.");
      expect(node?.attributes.description_source).toBe("llm");
    } finally {
      store.close();
    }

    // Byte-identical re-submission at the same content hash → the description cache skips the re-write.
    const second = run(["--apply-descriptions", payload]);
    expect(second.status).toBe(0);
    expect(JSON.parse(second.stdout)).toEqual({
      written: [],
      skipped: ["ghost.ts#nope:function", "handler.ts#dispatch:function"],
    });

    // A different text at the same content hash is a revision, not a cache hit — it writes.
    const revised = run([
      "--apply-descriptions",
      write_payload("descriptions.json", {
        descriptions: [{ symbol_path: "handler.ts#dispatch:function", text: "Routes a key to its registered handler." }],
      }),
    ]);
    expect(revised.status).toBe(0);
    expect(JSON.parse(revised.stdout)).toEqual({ written: ["handler.ts#dispatch:function"], skipped: [] });

    const reread = open_graph_store(path.join(repo, "graph.db"));
    try {
      const node = reread.all_nodes().find((n) => n.id === "agentic.description:handler.ts#dispatch:function");
      expect(node?.attributes.description).toBe("Routes a key to its registered handler.");
    } finally {
      reread.close();
    }
  });
});
