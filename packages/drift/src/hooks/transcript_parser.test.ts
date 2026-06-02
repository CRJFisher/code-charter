import { describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as path from "node:path";

import { parse_worked_on_files } from "./transcript_parser";

function fixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");
}

describe("parse_worked_on_files", () => {
  it("collects distinct file paths from edit tools, in first-seen order", () => {
    expect(parse_worked_on_files(fixture("transcript_sample.jsonl"))).toEqual([
      "src/a.ts",
      "src/b.ts",
      "nb/c.ipynb",
    ]);
  });

  it("ignores non-edit tools like Read", () => {
    expect(parse_worked_on_files(fixture("transcript_sample.jsonl"))).not.toContain(
      "src/should_not_count.ts",
    );
  });

  it("skips malformed lines but keeps valid edits", () => {
    expect(parse_worked_on_files(fixture("transcript_malformed.jsonl"))).toEqual(["src/keep.ts"]);
  });

  it("returns [] for empty input", () => {
    expect(parse_worked_on_files("")).toEqual([]);
  });
});
