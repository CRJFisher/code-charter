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

const INSTRUCTION = "Launch the `drift-reconciler` sub-agent.";

/**
 * A store dir with a synthetic run log and (optionally) a transcript tree beside it — the
 * trajectory path needs no real store: a missing db reads as the empty summary, so bridges are
 * simply absent and the spine still assembles from the record + transcript.
 */
function trajectory_fixture(opts: {
  with_transcript: boolean;
  with_stitch?: boolean;
  with_newer_record?: boolean;
}): { store: string; run_id: string } {
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
  const lines = [JSON.stringify(record)];
  if (opts.with_newer_record === true) {
    lines.push(
      JSON.stringify({ ...record, run_id: "20260710T130000000Z-eeeeeeee", timestamp: "2026-07-10T13:00:30.000Z" }),
    );
  }
  fs.writeFileSync(path.join(dir, "drift_reconcile_log.jsonl"), lines.join("\n") + "\n");
  if (opts.with_stitch === true) {
    fs.writeFileSync(
      path.join(dir, "stitch.json"),
      JSON.stringify({ umbrellas: [{ label: "entry umbrella", seeds: ["a", "b"], rationale: "same dispatch" }] }),
    );
  }
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

describe("drift-inspect bin — --trajectory (task-27.1.20.16)", () => {

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
    const { store, run_id } = trajectory_fixture({ with_transcript: true, with_stitch: true });
    const result = run(INSPECT_BIN, ["--store", store, "--trajectory", run_id, "--json"]);
    expect(result.status).toBe(0);
    const spine = JSON.parse(result.stdout) as {
      schema_version: number;
      transcript_available: boolean;
      steps: Array<Record<string, unknown>>;
    };
    expect(spine.schema_version).toBe(1);
    expect(spine.transcript_available).toBe(true);
    // The envelope partition, pinned on the bin's real output.
    expect(Object.keys(spine).sort()).toEqual([
      "availability_note",
      "detail",
      "run_id",
      "schema_version",
      "session_id",
      "steps",
      "timestamp",
      "transcript_available",
    ]);
    expect(spine.steps.map((s) => s.kind)).toContain("judgement");
    for (const step of spine.steps) {
      expect(["instruction", "context", "judgement", "effect"]).toContain(step.kind);
      expect(Object.keys(step).sort()).toEqual(["at", "detail", "kind", "ordinal", "summary"]);
    }
  });

  it("renders the stitch judgement for the newest run and omits it with a note for an older run", () => {
    const { store, run_id } = trajectory_fixture({ with_transcript: true, with_stitch: true, with_newer_record: true });
    const older = run(INSPECT_BIN, ["--store", store, "--trajectory", run_id, "--json"]);
    expect(older.status).toBe(0);
    const older_spine = JSON.parse(older.stdout) as { steps: Array<{ summary: string }>; detail: { notes: string[] } };
    expect(older_spine.steps.some((s) => s.summary.includes("entry umbrella"))).toBe(false);
    expect(older_spine.detail.notes).toContainEqual(expect.stringContaining("newest run"));

    const latest = run(INSPECT_BIN, ["--store", store, "--trajectory", "latest"]);
    expect(latest.status).toBe(0);
    expect(latest.stdout).toContain('stitch "entry umbrella" (2 seed(s)): same dispatch');
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

describe("drift-inspect bin — --grade (task-27.1.20.17)", () => {
  function grades_lines(store: string): string[] {
    return fs
      .readFileSync(path.join(path.dirname(store), "drift_run_grades.jsonl"), "utf8")
      .trimEnd()
      .split("\n");
  }

  function run_grade(store: string, input: string, extra: string[] = []): ReturnType<typeof run> {
    const result = spawnSync("node", [INSPECT_BIN, "--store", store, "--grade", ...extra], {
      encoding: "utf8",
      input,
    });
    return { stdout: result.stdout, stderr: result.stderr, status: result.status };
  }

  it("grades the newest ungraded run first and records verdict plus reason", () => {
    const { store } = trajectory_fixture({ with_transcript: true, with_newer_record: true });
    const result = run_grade(store, "g looks right\nq\n");
    expect(result.status).toBe(0);
    const lines = grades_lines(store);
    expect(lines).toHaveLength(1);
    const grade = JSON.parse(lines[0]) as { run_id: string; verdict: string; reason: string; detail: object };
    expect(grade.run_id).toBe("20260710T130000000Z-eeeeeeee"); // the newer of the two records
    expect(grade.verdict).toBe("good");
    expect(grade.reason).toBe("looks right");
    expect(Object.keys(grade).sort()).toEqual(["detail", "graded_at", "reason", "run_id", "schema_version", "verdict"]);
  });

  it("renders one screenful per run: changed files, spine, and flow summary", () => {
    const { store } = trajectory_fixture({ with_transcript: true });
    const result = run_grade(store, "q\n");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("changed files (1): main.ts");
    expect(result.stdout).toContain("Launch the `drift-reconciler` sub-agent.");
    expect(result.stdout).toContain("flows (hydrate 1):");
  });

  it("skips already-graded runs so a finished queue exits cleanly", () => {
    const { store } = trajectory_fixture({ with_transcript: true });
    expect(run_grade(store, "g fine\n").status).toBe(0);
    const again = run_grade(store, "");
    expect(again.status).toBe(0);
    expect(again.stdout).toContain("no ungraded runs");
  });

  it("resumes at the remaining run after an EOF mid-queue", () => {
    const { store } = trajectory_fixture({ with_transcript: true, with_newer_record: true });
    expect(run_grade(store, "g first\n").status).toBe(0); // EOF after one verdict
    const resumed = run_grade(store, "b second\n");
    expect(resumed.status).toBe(0);
    const verdicts = grades_lines(store).map((line) => (JSON.parse(line) as { verdict: string }).verdict);
    expect(verdicts.sort()).toEqual(["bad", "good"]);
  });

  it("leaves a run ungraded on an invalid line instead of hanging or mis-grading", () => {
    const { store } = trajectory_fixture({ with_transcript: true });
    const result = run_grade(store, "excellent nailed it\n");
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("unknown verdict");
    expect(fs.existsSync(path.join(path.dirname(store), "drift_run_grades.jsonl"))).toBe(false);
  });

  it("overwrites a grade only via --regrade, never duplicating the line", () => {
    const { store, run_id } = trajectory_fixture({ with_transcript: true });
    expect(run_grade(store, "g fine\n").status).toBe(0);
    const regrade = spawnSync("node", [INSPECT_BIN, "--store", store, "--regrade", run_id], {
      encoding: "utf8",
      input: "b actually wrong\n",
    });
    expect(regrade.status).toBe(0);
    const lines = grades_lines(store);
    expect(lines).toHaveLength(1);
    expect((JSON.parse(lines[0]) as { verdict: string }).verdict).toBe("bad");
  });

  it("rejects --grade combined with --trajectory as a usage error", () => {
    const result = run(INSPECT_BIN, ["--store", "/tmp/x.db", "--grade", "--trajectory", "latest"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("mutually exclusive");
  });
});
