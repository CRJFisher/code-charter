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
