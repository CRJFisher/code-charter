import { describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Importing the bin triggers its main(), which no-ops (a skip notice) without STITCH_EVAL_LIVE=1
// — the loader and scaffolder are deterministic and safe to unit-test in-process.
import { load_harvested_expectations, scaffold_repo } from "./stitch_eval";

function write_fixture(root: string, slug: string, manifest: unknown): void {
  const dir = path.join(root, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "main.ts"), "export function entry() { return 1; }\n");
  fs.writeFileSync(path.join(dir, "fixture.json"), JSON.stringify(manifest));
}

describe("load_harvested_expectations", () => {
  it("turns a harvested manifest into a runnable expectation with its own dir and staged set", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "drift-harvested-"));
    try {
      write_fixture(root, "bergamot_case", {
        schema_version: 1,
        run_id: "r1",
        verdict: "good",
        reason: "why",
        graded_at: "t",
        source_repo: "bergamot",
        harvested_at: "t2",
        detail: {
          kind: "stitch_seeds_only",
          files: ["main.ts"],
          expected_flow_count: 1,
          expected_members: ["main.ts#entry:function"],
          expected_description_anchors: ["main.ts#entry:function"],
        },
      });
      const expectations = load_harvested_expectations(root);
      expect(expectations).toHaveLength(1);
      expect(expectations[0]).toEqual({
        fixture: "bergamot_case",
        kind: "stitch_seeds_only",
        expected_flow_count: 1,
        expected_members: ["main.ts#entry:function"],
        expected_description_anchors: ["main.ts#entry:function"],
        dir: path.join(root, "bergamot_case"),
        staged_files: ["main.ts"],
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips foreign-version, malformed, and unknown-kind manifests instead of crashing the eval", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "drift-harvested-"));
    try {
      write_fixture(root, "foreign", { schema_version: 999, detail: { kind: "stitch", files: [] } });
      write_fixture(root, "bad_kind", { schema_version: 1, detail: { kind: "wat", files: [] } });
      const dir = path.join(root, "torn");
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, "fixture.json"), "not json");
      expect(load_harvested_expectations(root)).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns the empty list when the harvested home does not exist yet", () => {
    expect(load_harvested_expectations("/nonexistent/harvested")).toEqual([]);
  });
});

describe("scaffold_repo over a harvested fixture", () => {
  it("copies the snapshot without fixture.json and stages exactly the manifest's file set", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "drift-harvested-"));
    let repo: string | undefined;
    try {
      const dir = path.join(root, "case");
      fs.mkdirSync(path.join(dir, "src"), { recursive: true });
      fs.writeFileSync(path.join(dir, "src", "main.ts"), "export function entry() { return 1; }\n");
      fs.writeFileSync(path.join(dir, "src", "helper.ts"), "export function helper() { return 2; }\n");
      fs.writeFileSync(path.join(dir, "fixture.json"), "{}");
      repo = scaffold_repo({
        fixture: "case",
        kind: "decline",
        expected_flow_count: 1,
        expected_members: [],
        expected_description_anchors: [],
        dir,
        staged_files: ["src/main.ts"],
      });
      expect(fs.existsSync(path.join(repo, "src", "main.ts"))).toBe(true);
      expect(fs.existsSync(path.join(repo, "src", "helper.ts"))).toBe(true);
      // Scoring metadata never enters the repo the agent sees.
      expect(fs.existsSync(path.join(repo, "fixture.json"))).toBe(false);
      const pending = JSON.parse(
        fs.readFileSync(path.join(repo, ".code-charter", "drift_pending_reconcile.json"), "utf8"),
      ) as { files: string[] };
      expect(pending.files).toEqual(["src/main.ts"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      if (repo !== undefined) fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
