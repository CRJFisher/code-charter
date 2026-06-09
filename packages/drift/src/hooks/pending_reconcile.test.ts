import { describe, expect, it } from "@jest/globals";

import {
  merge_pending_reconcile,
  parse_pending_reconcile,
  pending_reconcile_path,
  serialize_pending_reconcile,
} from "./pending_reconcile";

describe("pending_reconcile", () => {
  it("round-trips a staged set", () => {
    const files = ["src/a.ts", "src/b.ts"];
    expect(parse_pending_reconcile(serialize_pending_reconcile(files))).toEqual(files);
  });

  it("parses malformed or wrong-shaped content as nothing pending", () => {
    expect(parse_pending_reconcile("not json")).toBeNull();
    expect(parse_pending_reconcile('{"files": "src/a.ts"}')).toBeNull();
    expect(parse_pending_reconcile('{"files": [1, 2]}')).toBeNull();
    expect(parse_pending_reconcile("null")).toBeNull();
  });

  it("unions an unconsumed prior set with this turn's set, preserving first-seen order", () => {
    expect(merge_pending_reconcile(["src/a.ts", "src/b.ts"], ["src/b.ts", "src/c.ts"])).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ]);
  });

  it("lives beside the store", () => {
    expect(pending_reconcile_path("/repo/.code-charter/graph.db")).toBe(
      "/repo/.code-charter/drift_pending_reconcile.json",
    );
  });
});
