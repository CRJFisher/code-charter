import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  grades_path,
  read_grades,
  upsert_grade,
  GRADE_RECORD_SCHEMA_VERSION,
  type RunGradeRecord,
} from "./grade_log";

let dir: string;
let store_path: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-grades-"));
  store_path = path.join(dir, "graph.db");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function grade(over: Partial<RunGradeRecord> = {}): RunGradeRecord {
  return {
    schema_version: GRADE_RECORD_SCHEMA_VERSION,
    run_id: "20260710T120000000Z-aabbccdd",
    verdict: "good",
    reason: "tracks the refactor",
    graded_at: "2026-07-10T15:00:00.000Z",
    detail: { mode: "default", file_set: ["src/a.ts"], transcript_available: true },
    ...over,
  };
}

describe("grade_log", () => {
  it("writes the register beside the store and round-trips through read_grades", () => {
    upsert_grade(store_path, grade());
    expect(path.dirname(grades_path(store_path))).toBe(dir);
    expect(read_grades(store_path).get(grade().run_id)).toEqual(grade());
  });

  it("keeps exactly one line per run_id across a regrade — overwrite, never duplicate", () => {
    upsert_grade(store_path, grade());
    upsert_grade(store_path, grade({ verdict: "bad", reason: "lost the retire" }));
    const raw = fs.readFileSync(grades_path(store_path), "utf8").trimEnd().split("\n");
    expect(raw).toHaveLength(1);
    expect(read_grades(store_path).get(grade().run_id)?.verdict).toBe("bad");
  });

  it("keeps other runs' grades intact through an upsert", () => {
    upsert_grade(store_path, grade({ run_id: "run-a" }));
    upsert_grade(store_path, grade({ run_id: "run-b", verdict: "mixed" }));
    upsert_grade(store_path, grade({ run_id: "run-a", verdict: "bad" }));
    const grades = read_grades(store_path);
    expect(grades.size).toBe(2);
    expect(grades.get("run-a")?.verdict).toBe("bad");
    expect(grades.get("run-b")?.verdict).toBe("mixed");
  });

  it("folds a hand-appended duplicate last-wins on read", () => {
    fs.writeFileSync(
      grades_path(store_path),
      JSON.stringify(grade({ verdict: "good" })) + "\n" + JSON.stringify(grade({ verdict: "mixed" })) + "\n",
    );
    expect(read_grades(store_path).get(grade().run_id)?.verdict).toBe("mixed");
  });

  it("skips torn, foreign-version, and off-enum lines instead of throwing", () => {
    fs.writeFileSync(
      grades_path(store_path),
      [
        "not json",
        JSON.stringify({ ...grade({ run_id: "foreign" }), schema_version: 999 }),
        JSON.stringify({ ...grade({ run_id: "off-enum" }), verdict: "excellent" }),
        JSON.stringify(grade({ run_id: "kept" })),
      ].join("\n") + "\n",
    );
    const grades = read_grades(store_path);
    expect([...grades.keys()]).toEqual(["kept"]);
  });

  it("leaves no temp sibling beside the register after upserts", () => {
    upsert_grade(store_path, grade({ run_id: "run-a" }));
    upsert_grade(store_path, grade({ run_id: "run-b" }));
    expect(fs.readdirSync(dir)).toEqual(["drift_run_grades.jsonl"]);
  });

  it("throws on an unwritable register so a typed verdict is never silently dropped", () => {
    const blocker = path.join(dir, "blocker");
    fs.writeFileSync(blocker, "");
    expect(() => upsert_grade(path.join(blocker, "graph.db"), grade())).toThrow();
  });

  it("partitions generic keys at the top level and drift context under detail (the pinned contract)", () => {
    expect(Object.keys(grade()).sort()).toEqual([
      "detail",
      "graded_at",
      "reason",
      "run_id",
      "schema_version",
      "verdict",
    ]);
    expect(Object.keys(grade().detail).sort()).toEqual(["file_set", "mode", "transcript_available"]);
  });

  it("the pinned contract doc's version matches the code constant", () => {
    const doc = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "contracts", "run_grade_record.md"), "utf8");
    expect(doc).toMatch(new RegExp(`^contract_version: ${GRADE_RECORD_SCHEMA_VERSION}$`, "m"));
  });
});
