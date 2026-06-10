import { describe, expect, it } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// End-to-end test of the built reconcile bin's reporting surface: a rename run must surface the
// seed-gone retirement in the --json outcomes and in the stderr summary. Requires the package to
// be built (turbo `test` depends on it).
const BIN = path.resolve(__dirname, "..", "..", "dist", "bin", "drift_reconcile.js");

interface OutcomeRecord {
  flow_id: string;
  action: string;
  kind: string;
}

function run_reconcile(repo: string, files: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(
    "node",
    [BIN, "--files", files.join(","), "--store", path.join(repo, "graph.db"), "--repo-root", repo, "--json"],
    { encoding: "utf8" },
  );
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

describe("drift-reconcile bin — retirement reporting (--json + summary)", () => {
  it("a rename run surfaces the retirement in the JSON outcomes and the summary line", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drift-bin-"));
    try {
      const v1 = "export function entry() { return helper(); }\n\nfunction helper() { return 1; }\n";
      fs.writeFileSync(path.join(repo, "main.ts"), v1);

      const first = run_reconcile(repo, ["main.ts"]);
      expect(first.status).toBe(0);
      const hydrated = JSON.parse(first.stdout) as OutcomeRecord[];
      expect(hydrated).toContainEqual(
        expect.objectContaining({ flow_id: "main.ts#entry:function", action: "hydrate" }),
      );

      fs.writeFileSync(path.join(repo, "main.ts"), v1.replace(/entry/g, "entry_renamed"));
      const second = run_reconcile(repo, ["main.ts"]);
      expect(second.status).toBe(0);

      const outcomes = JSON.parse(second.stdout) as OutcomeRecord[];
      expect(outcomes).toContainEqual(
        expect.objectContaining({ flow_id: "main.ts#entry:function", action: "retire", kind: "code" }),
      );
      expect(outcomes).toContainEqual(
        expect.objectContaining({ flow_id: "main.ts#entry_renamed:function", action: "hydrate" }),
      );
      expect(second.stderr).toMatch(/reconciled 2 flow\(s\) \(1 retired\) over 1 file\(s\)/);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
