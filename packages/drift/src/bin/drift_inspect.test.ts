import { describe, expect, it } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { Anomaly, StoreSummary } from "../inspect/summary";

const RECONCILE_BIN = path.resolve(__dirname, "..", "..", "dist", "bin", "drift_reconcile.js");
const INSPECT_BIN = path.resolve(__dirname, "..", "..", "dist", "bin", "drift_inspect.js");

function run(bin: string, args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync("node", [bin, ...args], { encoding: "utf8" });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

/** A repo with a hydrated store: one entry function calling a helper → one code flow. */
function reconciled_repo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-inspect-"));
  fs.writeFileSync(
    path.join(repo, "main.ts"),
    "export function entry() { return helper(); }\n\nfunction helper() { return 1; }\n",
  );
  const reconcile = run(RECONCILE_BIN, [
    "--files",
    "main.ts",
    "--store",
    path.join(repo, "graph.db"),
    "--repo-root",
    repo,
  ]);
  expect(reconcile.status).toBe(0);
  return repo;
}

describe("drift-inspect bin", () => {
  it("summarizes a hydrated store, reading membership from anchor_set (--json)", () => {
    const repo = reconciled_repo();
    try {
      const result = run(INSPECT_BIN, ["--store", path.join(repo, "graph.db"), "--json"]);
      expect(result.status).toBe(0);

      const summary = JSON.parse(result.stdout) as StoreSummary;
      expect(summary.live_flow_count).toBeGreaterThanOrEqual(1);
      const entry = summary.flows.find((flow) => flow.id === "main.ts#entry:function");
      expect(entry).toBeDefined();
      expect(entry?.member_count).toBeGreaterThanOrEqual(1);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("drills into one flow with --flow", () => {
    const repo = reconciled_repo();
    try {
      const result = run(INSPECT_BIN, ["--store", path.join(repo, "graph.db"), "--flow", "main.ts#entry:function"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("flow main.ts#entry:function [live]");
      expect(result.stdout).toContain("members (");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("exits 1 and names the flow when --flow is unknown", () => {
    const repo = reconciled_repo();
    try {
      const result = run(INSPECT_BIN, ["--store", path.join(repo, "graph.db"), "--flow", "does.ts#not:function"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('no flow with id "does.ts#not:function"');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("lints clean when the store is healthy and no stitch is declared", () => {
    const repo = reconciled_repo();
    try {
      const result = run(INSPECT_BIN, ["--store", path.join(repo, "graph.db"), "--lint"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("no anomalies detected");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("lints clean for a seeds-only stitch.json (declares 0 bridges)", () => {
    const repo = reconciled_repo();
    try {
      fs.writeFileSync(
        path.join(repo, "stitch.json"),
        JSON.stringify({ umbrellas: [{ label: "u", seeds: ["a", "b"], bridges: [], rationale: "seeds-only" }] }),
      );

      const result = run(INSPECT_BIN, ["--store", path.join(repo, "graph.db"), "--lint"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("no anomalies detected");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("surfaces a retired flow through the real read path (--flow on a soft-deleted flow)", () => {
    const repo = reconciled_repo();
    try {
      // Rename the entry symbol so reconcile retires the old flow (soft-deletes its node).
      fs.writeFileSync(
        path.join(repo, "main.ts"),
        "export function entry_renamed() { return helper(); }\n\nfunction helper() { return 1; }\n",
      );
      const reconcile = run(RECONCILE_BIN, ["--files", "main.ts", "--store", path.join(repo, "graph.db"), "--repo-root", repo]);
      expect(reconcile.status).toBe(0);

      const summary = JSON.parse(
        run(INSPECT_BIN, ["--store", path.join(repo, "graph.db"), "--json"]).stdout,
      ) as StoreSummary;
      expect(summary.retired_flow_count).toBeGreaterThanOrEqual(1);
      const retired = summary.flows.find((flow) => flow.id === "main.ts#entry:function");
      expect(retired?.live).toBe(false);

      // The retired flow is reachable by --flow (would exit 1 if the read path hid soft-deleted rows).
      const detail = run(INSPECT_BIN, ["--store", path.join(repo, "graph.db"), "--flow", "main.ts#entry:function"]);
      expect(detail.status).toBe(0);
      expect(detail.stdout).toContain("[retired]");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("flags declared-but-unpersisted bridges and exits 1 (--lint --json)", () => {
    const repo = reconciled_repo();
    try {
      fs.writeFileSync(
        path.join(repo, "stitch.json"),
        JSON.stringify({ umbrellas: [{ label: "u", seeds: ["a", "b"], bridges: [{ from: "a", to: "b" }], rationale: "r" }] }),
      );

      const result = run(INSPECT_BIN, ["--store", path.join(repo, "graph.db"), "--lint", "--json"]);
      expect(result.status).toBe(1);
      const anomalies = JSON.parse(result.stdout) as Anomaly[];
      expect(anomalies.map((a) => a.code)).toContain("unpersisted_bridges");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("treats a never-reconciled store as the empty summary, not an error", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-inspect-cold-"));
    try {
      const result = run(INSPECT_BIN, ["--store", path.join(repo, "graph.db"), "--json"]);
      expect(result.status).toBe(0);
      const summary = JSON.parse(result.stdout) as StoreSummary;
      expect(summary.live_flow_count).toBe(0);
      expect(summary.sync_status).toBeNull();
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("errors with usage on a missing --store", () => {
    const result = run(INSPECT_BIN, ["--json"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("missing required --store");
  });

  it("errors with usage on an unknown argument", () => {
    const result = run(INSPECT_BIN, ["--store", "x.db", "--bogus"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown argument: --bogus");
  });

  it("rejects --flow and --lint together", () => {
    const result = run(INSPECT_BIN, ["--store", "x.db", "--flow", "f", "--lint"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("mutually exclusive");
  });
});

describe("drift-inspect bin — --trajectory (task-27.1.20.16)", () => {
  const INSTRUCTION = "Launch the `drift-reconciler` sub-agent.";

  /**
   * A store dir with a synthetic run log and (optionally) a transcript tree beside it — the
   * trajectory path needs no real store: a missing db reads as the empty summary, so bridges are
   * simply absent and the spine still assembles from the record + transcript.
   */
  function trajectory_fixture(opts: { with_transcript: boolean }): { store: string; run_id: string } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-traj-"));
    const store = path.join(dir, "graph.db");
    const run_id = "20260710T120000000Z-aabbccdd";
    const transcript_path = path.join(dir, "sess.jsonl");
    const record = {
      schema_version: 1,
      run_id,
      session_id: "s1",
      transcript_path,
      instruction: INSTRUCTION,
      timestamp: "2026-07-10T12:00:30.000Z",
      detail: {
        mode: "default",
        file_set: ["main.ts"],
        outcomes: [
          {
            flow_id: "main.ts#entry:function",
            action: "hydrate",
            kind: "code",
            member_count: 2,
            last_synced_at: "2026-07-10T12:00:29.000Z",
            reason: "new entrypoint over the changed files",
          },
        ],
        deferred_retirements: [],
        deferred_skill_syncs: [],
        description_counts: { docstring: 0, provisional: 2, placeholder: 0, llm: 0 },
        diagnostics: [],
      },
    };
    fs.writeFileSync(path.join(dir, "drift_reconcile_log.jsonl"), JSON.stringify(record) + "\n");
    if (opts.with_transcript) {
      const launch = {
        type: "assistant",
        timestamp: "2026-07-10T12:00:05.000Z",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "tu_1", name: "Task", input: { subagent_type: "drift-reconciler" } }],
        },
      };
      const result = {
        type: "user",
        timestamp: "2026-07-10T12:00:40.000Z",
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", content: "done" }] },
        toolUseResult: { agentId: "AG1" },
      };
      fs.writeFileSync(transcript_path, JSON.stringify(launch) + "\n" + JSON.stringify(result) + "\n");
      const subagents = path.join(dir, "sess", "subagents");
      fs.mkdirSync(subagents, { recursive: true });
      const read_step = {
        type: "assistant",
        timestamp: "2026-07-10T12:00:10.000Z",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "st1", name: "Read", input: { file_path: "src/a.ts" } }],
        },
      };
      fs.writeFileSync(path.join(subagents, "agent-AG1.jsonl"), JSON.stringify(read_step) + "\n");
      fs.writeFileSync(
        path.join(subagents, "agent-AG1.meta.json"),
        JSON.stringify({ agentType: "drift-reconciler", toolUseId: "tu_1" }),
      );
    }
    return { store, run_id };
  }

  it("prints the full trajectory for a resolvable run id", () => {
    const { store, run_id } = trajectory_fixture({ with_transcript: true });
    const result = run(INSPECT_BIN, ["--store", store, "--trajectory", run_id]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(INSTRUCTION);
    expect(result.stdout).toContain("Read src/a.ts");
    expect(result.stdout).toContain("hydrate main.ts#entry:function");
    expect(result.stdout).toContain("described: docstring 0, llm 0, provisional 2, placeholder 0");
  });

  it("resolves latest to the newest record", () => {
    const { store } = trajectory_fixture({ with_transcript: true });
    const result = run(INSPECT_BIN, ["--store", store, "--trajectory", "latest"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(INSTRUCTION);
  });

  it("prints an effect-only view without erroring when the transcript is rotated away", () => {
    const { store, run_id } = trajectory_fixture({ with_transcript: false });
    const result = run(INSPECT_BIN, ["--store", store, "--trajectory", run_id]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("transcript unavailable");
    expect(result.stdout).toContain("effect-only view");
    expect(result.stdout).toContain("hydrate main.ts#entry:function");
  });

  it("--json emits the neutral four-kind spine schema with drift payloads under detail", () => {
    const { store, run_id } = trajectory_fixture({ with_transcript: true });
    const result = run(INSPECT_BIN, ["--store", store, "--trajectory", run_id, "--json"]);
    expect(result.status).toBe(0);
    const spine = JSON.parse(result.stdout) as {
      schema_version: number;
      transcript_available: boolean;
      steps: Array<Record<string, unknown>>;
    };
    expect(spine.schema_version).toBe(1);
    expect(spine.transcript_available).toBe(true);
    expect(spine.steps.length).toBeGreaterThan(0);
    for (const step of spine.steps) {
      expect(["instruction", "context", "judgement", "effect"]).toContain(step.kind);
      expect(Object.keys(step).sort()).toEqual(["at", "detail", "kind", "ordinal", "summary"]);
    }
  });

  it("exits 1 when the run id resolves to no record", () => {
    const { store } = trajectory_fixture({ with_transcript: false });
    const result = run(INSPECT_BIN, ["--store", store, "--trajectory", "20990101T000000000Z-ffffffff"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no reconcile run");
  });

  it("rejects --trajectory combined with --lint as a usage error", () => {
    const result = run(INSPECT_BIN, ["--store", "/tmp/x.db", "--trajectory", "latest", "--lint"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("mutually exclusive");
  });
});
