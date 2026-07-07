import { describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  merge_pending_reconcile,
  parse_pending_reconcile,
  pending_reconcile_path,
  serialize_pending_reconcile,
  write_pending_reconcile_atomic,
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
    expect(parse_pending_reconcile('{"other": []}')).toBeNull();
    expect(parse_pending_reconcile("null")).toBeNull();
  });

  it("parses an empty staged set as an empty list, distinct from nothing pending", () => {
    expect(parse_pending_reconcile('{"files": []}')).toEqual([]);
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

  it("writes the staged set via a temp sibling then rename, leaving no temp behind", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-pending-"));
    const pending = path.join(dir, "store", "drift_pending_reconcile.json");
    try {
      write_pending_reconcile_atomic(pending, ["src/a.ts", "src/b.ts"]);
      expect(parse_pending_reconcile(fs.readFileSync(pending, "utf8"))).toEqual(["src/a.ts", "src/b.ts"]);
      expect(fs.readdirSync(path.dirname(pending))).toEqual(["drift_pending_reconcile.json"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("replaces an existing pending file in place", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-pending-"));
    const pending = path.join(dir, "drift_pending_reconcile.json");
    try {
      fs.writeFileSync(pending, serialize_pending_reconcile(["src/old.ts"]));
      write_pending_reconcile_atomic(pending, ["src/new.ts"]);
      expect(parse_pending_reconcile(fs.readFileSync(pending, "utf8"))).toEqual(["src/new.ts"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws (and removes its temp file) when the rename target cannot be replaced", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-pending-"));
    const pending = path.join(dir, "drift_pending_reconcile.json");
    try {
      fs.mkdirSync(pending); // a directory at the target path defeats rename-over
      expect(() => write_pending_reconcile_atomic(pending, ["src/a.ts"])).toThrow();
      expect(fs.readdirSync(dir)).toEqual(["drift_pending_reconcile.json"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
