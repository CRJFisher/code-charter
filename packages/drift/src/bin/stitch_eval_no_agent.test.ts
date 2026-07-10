import { describe, expect, it } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Spawns the built stitch_eval bin in --no-agent mode: the token-free deterministic floor.
// Requires the package to be built (turbo `test` depends on it); Ariadne runs inside the spawned
// reconcile bin, so this suite lives in the isolated test group.
const EVAL_BIN = path.resolve(__dirname, "..", "..", "dist", "bin", "stitch_eval.js");

function run_eval(
  args: string[],
  env: Record<string, string> = {},
): { stdout: string; stderr: string; status: number | null } {
  // No STITCH_EVAL_LIVE and a PATH without `claude`: the mode must need neither.
  const result = spawnSync("node", [EVAL_BIN, ...args], {
    encoding: "utf8",
    env: { ...process.env, STITCH_EVAL_LIVE: "", PATH: path.dirname(process.execPath), ...env },
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

describe("stitch_eval --no-agent (the token-free deterministic floor)", () => {
  it("scores a fixture's pre-stitch fragmented shape as PASS without an agent or tokens", () => {
    const result = run_eval(["--no-agent", "control_unrelated_pair"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MODE: --no-agent");
    expect(result.stdout).toContain("does NOT exercise stitch/describe judgement");
    expect(result.stdout).toContain("control_unrelated_pair");
    expect(result.stdout).toContain("PASS");
  });

  it("verifies a stitch fixture presents its resolution gap: fragments, no bridges, no llm text", () => {
    const result = run_eval(["--no-agent", "dynamic_key_dispatch"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("summary: 1/1 PASS");
    // Three fragmented singletons — the pre-stitch floor, not the stitched umbrella.
    expect(result.stdout.match(/^ {2}flow /gm)).toHaveLength(3);
  });

  it("rejects an unknown fixture with usage exit code", () => {
    const result = run_eval(["--no-agent", "nope"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown fixture");
  });

  it("skips a floor-less harvested fixture instead of failing the token-free gate", () => {
    const harvested = fs.mkdtempSync(path.join(os.tmpdir(), "drift-harvested-noagent-"));
    try {
      const dir = path.join(harvested, "bergamot_case");
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, "main.ts"), "export function entry() { return 1; }\n");
      fs.writeFileSync(
        path.join(dir, "fixture.json"),
        JSON.stringify({
          schema_version: 1,
          detail: { kind: "stitch_seeds_only", files: ["main.ts"], expected_members: ["main.ts#entry:function"] },
        }),
      );
      const result = run_eval(["--no-agent", "control_unrelated_pair"], { STITCH_EVAL_HARVESTED_DIR: harvested });
      expect(result.status).toBe(0);
      const all = run_eval(["--no-agent", "bergamot_case"], { STITCH_EVAL_HARVESTED_DIR: harvested });
      // The harvested fixture is selectable but floor-less — a genuine skip, never a FAIL.
      expect(all.status).toBe(0);
      expect(all.stdout).toContain("skipping 1 floor-less fixture(s)");
      expect(all.stdout).toContain("nothing to score");
      expect(all.stdout).not.toContain("FAIL");
    } finally {
      fs.rmSync(harvested, { recursive: true, force: true });
    }
  });
});
