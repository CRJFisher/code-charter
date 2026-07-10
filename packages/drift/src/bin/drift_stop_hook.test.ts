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

function run_stop_hook_raw(
  input: string,
  env: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("node", [BIN], { input, encoding: "utf8", env: { ...process.env, ...env } });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function run_stop_hook(
  payload: Record<string, unknown>,
  env: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  return run_stop_hook_raw(JSON.stringify(payload), env);
}

interface StagedHandoff {
  files: string[];
  session: { session_id: string; cwd: string; instruction: string } | null;
}

/** The staged handoff the hook wrote beside the store, or null when nothing was staged. */
function read_handoff(cwd: string): StagedHandoff | null {
  const pending = path.join(cwd, ".code-charter", "drift_pending_reconcile.json");
  try {
    return JSON.parse(fs.readFileSync(pending, "utf8")) as StagedHandoff;
  } catch {
    return null;
  }
}

function read_pending(cwd: string): string[] | null {
  return read_handoff(cwd)?.files ?? null;
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

  it("stages the session context beside the files: join key plus the verbatim instruction", () => {
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
      const output = JSON.parse(result.stdout);
      // Verbatim by construction: the staged instruction IS the block reason the hook emitted.
      expect(read_handoff(dir)?.session).toEqual({ session_id: "s1", cwd: dir, instruction: output.reason });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("emits no divergence note when the payload's transcript path matches the derivation", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-stop-"));
    const config_dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-stop-cfg-"));
    const slug = dir.replace(/[^A-Za-z0-9]/g, "-");
    const transcript_path = path.join(config_dir, "projects", slug, "s1.jsonl");
    fs.mkdirSync(path.dirname(transcript_path), { recursive: true });
    fs.writeFileSync(transcript_path, TRANSCRIPT_LINE + "\n");
    try {
      const result = run_stop_hook(
        { session_id: "s1", transcript_path, cwd: dir, hook_event_name: "Stop" },
        { CLAUDE_CONFIG_DIR: config_dir },
      );
      expect(JSON.parse(result.stdout).decision).toBe("block");
      expect(result.stderr).not.toContain("diverges");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(config_dir, { recursive: true, force: true });
    }
  });

  it("notes both paths on stderr when the derivation diverges from the host's transcript path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-stop-"));
    const transcript_path = path.join(dir, "t.jsonl");
    fs.writeFileSync(transcript_path, TRANSCRIPT_LINE + "\n");
    try {
      const result = run_stop_hook({ session_id: "s1", transcript_path, cwd: dir, hook_event_name: "Stop" });
      expect(JSON.parse(result.stdout).decision).toBe("block"); // the note never blocks the block
      expect(result.stderr).toContain("diverges");
      expect(result.stderr).toContain(transcript_path);
      expect(result.stderr).toContain("s1.jsonl");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("attributes a unioned handoff to the newest contributing session", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-stop-"));
    const transcript_a = path.join(dir, "a.jsonl");
    const transcript_b = path.join(dir, "b.jsonl");
    fs.writeFileSync(transcript_a, edit_line("src/a.ts", "a1") + "\n");
    fs.writeFileSync(transcript_b, edit_line("src/b.ts", "b1") + "\n");
    try {
      run_stop_hook({ session_id: "sA", transcript_path: transcript_a, cwd: dir, hook_event_name: "Stop" });
      run_stop_hook({ session_id: "sB", transcript_path: transcript_b, cwd: dir, hook_event_name: "Stop" });
      const staged = read_handoff(dir);
      expect(staged?.files).toEqual(["src/a.ts", "src/b.ts"]);
      expect(staged?.session?.session_id).toBe("sB");
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

  it("holds the watermark when staging fails, so the same edits re-fire and recover next turn", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-stop-"));
    const transcript_path = path.join(dir, "t.jsonl");
    fs.writeFileSync(transcript_path, TRANSCRIPT_LINE + "\n");
    const payload = { session_id: "s1", transcript_path, cwd: dir, hook_event_name: "Stop" };
    const pending = path.join(dir, ".code-charter", "drift_pending_reconcile.json");
    // A directory at the pending path defeats the atomic rename, forcing a staging failure.
    fs.mkdirSync(pending, { recursive: true });
    try {
      const failed = run_stop_hook(payload);
      expect(failed.status).toBe(0);
      expect(failed.stdout).toBe(""); // nothing staged → no block dispatched
      // the failed atomic write must clean up its temp sibling
      const residue = fs.readdirSync(path.join(dir, ".code-charter")).filter((name) => name.endsWith(".tmp"));
      expect(residue).toEqual([]);
      fs.rmdirSync(pending); // the obstruction clears...
      const retried = run_stop_hook(payload); // ...and the SAME transcript re-fires the edit
      expect(JSON.parse(retried.stdout).decision).toBe("block");
      expect(read_pending(dir)).toEqual(["src/a.ts"]); // the cursor never advanced past it
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves no temp-file residue beside the store after staging", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-stop-"));
    const transcript_path = path.join(dir, "t.jsonl");
    fs.writeFileSync(transcript_path, TRANSCRIPT_LINE + "\n");
    try {
      run_stop_hook({ session_id: "s1", transcript_path, cwd: dir, hook_event_name: "Stop" });
      const residue = fs.readdirSync(path.join(dir, ".code-charter")).filter((name) => name.endsWith(".tmp"));
      expect(residue).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("GCs dead per-session watermark cursors while keeping fresh ones and the current fire's cursor", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-stop-"));
    const store_dir = path.join(dir, ".code-charter");
    fs.mkdirSync(store_dir, { recursive: true });
    const dead = path.join(store_dir, "drift_stop_watermark.dead-session.json");
    const recent = path.join(store_dir, "drift_stop_watermark.recent-session.json");
    fs.writeFileSync(dead, "{}");
    fs.writeFileSync(recent, "{}");
    const eight_days_ago = Date.now() / 1000 - 8 * 24 * 60 * 60;
    fs.utimesSync(dead, eight_days_ago, eight_days_ago);
    const transcript_path = path.join(dir, "t.jsonl");
    fs.writeFileSync(transcript_path, TRANSCRIPT_LINE + "\n");
    try {
      run_stop_hook({ session_id: "s1", transcript_path, cwd: dir, hook_event_name: "Stop" });
      expect(fs.existsSync(dead)).toBe(false); // the 8-day-old cursor is pruned
      expect(fs.existsSync(recent)).toBe(true); // a recently-touched cursor is left alone
      // The cursor this very fire wrote is never a GC victim (it is younger than the max age).
      expect(fs.existsSync(path.join(store_dir, "drift_stop_watermark.s1.json"))).toBe(true);
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
