import { describe, expect, it } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// End-to-end test of the built Stop-hook bin: stdin payload + a real transcript file -> stdout
// block JSON. Exercises the glue (parse payload -> read transcript -> decide -> emit) that the
// pure-function tests don't cover. Requires the package to be built (turbo `test` depends on it).
const BIN = path.resolve(__dirname, "..", "..", "dist", "bin", "drift_stop_hook.js");

const TRANSCRIPT_LINE = JSON.stringify({
  type: "assistant",
  message: {
    role: "assistant",
    content: [{ type: "tool_use", name: "Edit", id: "t1", input: { file_path: "src/a.ts" } }],
  },
});

function run_stop_hook(payload: Record<string, unknown>): { status: number | null; stdout: string } {
  const result = spawnSync("node", [BIN], { input: JSON.stringify(payload), encoding: "utf8" });
  return { status: result.status, stdout: result.stdout };
}

describe("drift_stop_hook bin", () => {
  it("emits a block decision naming the changed file and the drift-reconciler sub-agent", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-stop-"));
    const transcript_path = path.join(dir, "t.jsonl");
    fs.writeFileSync(transcript_path, TRANSCRIPT_LINE + "\n");
    try {
      const result = run_stop_hook({
        session_id: "s1",
        transcript_path,
        cwd: dir,
        hook_event_name: "Stop",
      });
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.decision).toBe("block");
      expect(output.reason).toContain("src/a.ts");
      expect(output.reason).toContain("drift-reconciler");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("no-ops on a second fire with no new edits (watermark makes it satisfiable)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-stop-"));
    const transcript_path = path.join(dir, "t.jsonl");
    fs.writeFileSync(transcript_path, TRANSCRIPT_LINE + "\n");
    const payload = { session_id: "s1", transcript_path, cwd: dir, hook_event_name: "Stop" };
    try {
      const first = run_stop_hook(payload);
      expect(JSON.parse(first.stdout).decision).toBe("block"); // first fire reconciles the edit
      const second = run_stop_hook(payload); // same transcript, nothing new
      expect(second.stdout).toBe(""); // watermark advanced → no re-nag
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("re-fires for only the newly edited file after the watermark advances", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-stop-"));
    const transcript_path = path.join(dir, "t.jsonl");
    fs.writeFileSync(transcript_path, TRANSCRIPT_LINE + "\n");
    const payload = { session_id: "s1", transcript_path, cwd: dir, hook_event_name: "Stop" };
    try {
      run_stop_hook(payload); // first fire handles src/a.ts, advances the cursor
      const next_edit = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Edit", id: "t2", input: { file_path: "src/b.ts" } }] },
      });
      fs.appendFileSync(transcript_path, next_edit + "\n");
      const result = run_stop_hook(payload);
      const output = JSON.parse(result.stdout);
      expect(output.decision).toBe("block");
      expect(output.reason).toContain("src/b.ts");
      expect(output.reason).not.toContain("src/a.ts"); // already reconciled — not re-listed
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("no-ops (empty stdout) when stop_hook_active is set", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-stop-"));
    const transcript_path = path.join(dir, "t.jsonl");
    fs.writeFileSync(transcript_path, TRANSCRIPT_LINE + "\n");
    try {
      const result = run_stop_hook({
        session_id: "s1",
        transcript_path,
        cwd: dir,
        hook_event_name: "Stop",
        stop_hook_active: true,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
