import { describe, expect, it } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// End-to-end test of the built Stop-hook bin: stdin payload + a real transcript file -> stdout
// block JSON + the staged pending-reconcile file. Exercises the glue (parse payload -> read
// transcript -> decide -> stage -> emit) that the pure-function tests don't cover. Requires the
// package to be built (turbo `test` depends on it).
const BIN = path.resolve(__dirname, "..", "..", "dist", "bin", "drift_stop_hook.js");

const TRANSCRIPT_LINE = JSON.stringify({
  type: "assistant",
  message: {
    role: "assistant",
    content: [{ type: "tool_use", name: "Edit", id: "t1", input: { file_path: "src/a.ts" } }],
  },
});

function edit_line(file_path: string, id: string): string {
  return JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "Edit", id, input: { file_path } }] },
  });
}

function run_stop_hook_raw(input: string): { status: number | null; stdout: string } {
  const result = spawnSync("node", [BIN], { input, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout };
}

function run_stop_hook(payload: Record<string, unknown>): { status: number | null; stdout: string } {
  return run_stop_hook_raw(JSON.stringify(payload));
}

/** The staged set the hook wrote beside the store, or null when nothing was staged. */
function read_pending(cwd: string): string[] | null {
  const pending = path.join(cwd, ".code-charter", "drift_pending_reconcile.json");
  try {
    return (JSON.parse(fs.readFileSync(pending, "utf8")) as { files: string[] }).files;
  } catch {
    return null;
  }
}

describe("drift_stop_hook bin", () => {
  it("stages the changed file and emits a block decision naming only the sub-agent", () => {
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
      expect(output.reason).toContain("drift-reconciler");
      expect(output.reason).not.toContain("src/a.ts"); // the list travels via the pending file
      expect(read_pending(dir)).toEqual(["src/a.ts"]);
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

  it("re-fires for a newly edited file, unioning it into an unconsumed staged set", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-stop-"));
    const transcript_path = path.join(dir, "t.jsonl");
    fs.writeFileSync(transcript_path, TRANSCRIPT_LINE + "\n");
    const payload = { session_id: "s1", transcript_path, cwd: dir, hook_event_name: "Stop" };
    try {
      run_stop_hook(payload); // first fire stages src/a.ts, advances the cursor
      const next_edit = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Edit", id: "t2", input: { file_path: "src/b.ts" } }] },
      });
      fs.appendFileSync(transcript_path, next_edit + "\n");
      const result = run_stop_hook(payload);
      expect(JSON.parse(result.stdout).decision).toBe("block");
      // src/a.ts was never consumed (no reconcile ran), so the second fire retries it too.
      expect(read_pending(dir)).toEqual(["src/a.ts", "src/b.ts"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("no-ops when the only edits this turn are non-flow files (the standalone-doc case)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-stop-"));
    const transcript_path = path.join(dir, "t.jsonl");
    // A standalone README under the repo root: no supported extension and no SKILL.md ancestor.
    fs.writeFileSync(transcript_path, edit_line(path.join(dir, "README.md"), "d1") + "\n");
    try {
      const result = run_stop_hook({ session_id: "s1", transcript_path, cwd: dir, hook_event_name: "Stop" });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(""); // dropped to empty → no-new-drift guard no-ops, no reconcile launched
      expect(read_pending(dir)).toBeNull(); // and nothing was staged
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("stages only the flow-relevant file when a turn mixes source and docs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-stop-"));
    const transcript_path = path.join(dir, "t.jsonl");
    const doc = path.join(dir, "README.md");
    const src = path.join(dir, "src", "a.ts");
    fs.writeFileSync(transcript_path, edit_line(doc, "m1") + "\n" + edit_line(src, "m2") + "\n");
    try {
      const result = run_stop_hook({ session_id: "s1", transcript_path, cwd: dir, hook_event_name: "Stop" });
      expect(JSON.parse(result.stdout).decision).toBe("block");
      // Staged repo-relative: the doc is filtered out, not handed to the reconciler.
      expect(read_pending(dir)).toEqual(["src/a.ts"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps independent cursors for concurrent sessions in the same repo", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-stop-"));
    const transcript_a = path.join(dir, "a.jsonl");
    const transcript_b = path.join(dir, "b.jsonl");
    fs.writeFileSync(transcript_a, edit_line("src/a.ts", "a1") + "\n");
    fs.writeFileSync(transcript_b, edit_line("src/b.ts", "b1") + "\n");
    const payload_a = { session_id: "sA", transcript_path: transcript_a, cwd: dir, hook_event_name: "Stop" };
    const payload_b = { session_id: "sB", transcript_path: transcript_b, cwd: dir, hook_event_name: "Stop" };
    try {
      run_stop_hook(payload_a); // session A stages src/a.ts and advances its own cursor
      // The reconciler consumes A's handoff before B fires.
      fs.rmSync(path.join(dir, ".code-charter", "drift_pending_reconcile.json"));
      run_stop_hook(payload_b); // session B fires in between — must not reset A's cursor
      const again = run_stop_hook(payload_a); // A again, no new edits
      expect(again.stdout).toBe(""); // a shared cursor would re-fire ALL of A's edits here
      expect(read_pending(dir)).toEqual(["src/b.ts"]); // only B's unconsumed handoff remains staged
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("no-ops (exit 0, empty stdout) on malformed stdin so a garbage payload never breaks the session", () => {
    const result = run_stop_hook_raw("not json at all");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("no-ops on a well-formed payload that lacks transcript_path", () => {
    const result = run_stop_hook_raw(JSON.stringify({ session_id: "s1", cwd: "/tmp", hook_event_name: "Stop" }));
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
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
