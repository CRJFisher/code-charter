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
  type PendingReconcile,
  type PendingSession,
} from "./pending_reconcile";

const SESSION: PendingSession = {
  session_id: "s1",
  cwd: "/repo",
  instruction: "Launch the `drift-reconciler` sub-agent.",
};

function handoff(files: string[], session: PendingSession | null = null): PendingReconcile {
  return { files, session };
}

describe("pending_reconcile", () => {
  it("round-trips a staged handoff carrying files and the session context", () => {
    const staged = handoff(["src/a.ts", "src/b.ts"], SESSION);
    expect(parse_pending_reconcile(serialize_pending_reconcile(staged))).toEqual(staged);
  });

  it("round-trips a session-less handoff", () => {
    const staged = handoff(["src/a.ts"]);
    expect(parse_pending_reconcile(serialize_pending_reconcile(staged))).toEqual(staged);
  });

  it("parses malformed or wrong-shaped content as nothing pending", () => {
    expect(parse_pending_reconcile("not json")).toBeNull();
    expect(parse_pending_reconcile('{"files": "src/a.ts"}')).toBeNull();
    expect(parse_pending_reconcile('{"files": [1, 2]}')).toBeNull();
    expect(parse_pending_reconcile('{"other": []}')).toBeNull();
    expect(parse_pending_reconcile("null")).toBeNull();
  });

  it("parses a files-only handoff with a null session", () => {
    expect(parse_pending_reconcile('{"files": ["src/a.ts"]}')).toEqual(handoff(["src/a.ts"]));
  });

  it("keeps the files when the session is malformed — metadata never drops the set", () => {
    expect(parse_pending_reconcile('{"files": ["src/a.ts"], "session": {"session_id": 7}}')).toEqual(
      handoff(["src/a.ts"]),
    );
    expect(parse_pending_reconcile('{"files": ["src/a.ts"], "session": "s1"}')).toEqual(handoff(["src/a.ts"]));
  });

  it("parses an empty staged set as an empty list, distinct from nothing pending", () => {
    expect(parse_pending_reconcile('{"files": []}')).toEqual(handoff([]));
  });

  it("unions an unconsumed prior set with this turn's set, preserving first-seen order", () => {
    const merged = merge_pending_reconcile(handoff(["src/a.ts", "src/b.ts"]), handoff(["src/b.ts", "src/c.ts"]));
    expect(merged.files).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
  });

  it("takes the current fire's session over the prior one", () => {
    const prior_session = { ...SESSION, session_id: "s0" };
    const merged = merge_pending_reconcile(handoff(["src/a.ts"], prior_session), handoff(["src/b.ts"], SESSION));
    expect(merged.session).toEqual(SESSION);
  });

  it("keeps the prior session when the current set carries none", () => {
    const merged = merge_pending_reconcile(handoff(["src/a.ts"], SESSION), handoff(["src/b.ts"]));
    expect(merged.session).toEqual(SESSION);
  });

  it("lives beside the store", () => {
    expect(pending_reconcile_path("/repo/.code-charter/graph.db")).toBe(
      "/repo/.code-charter/drift_pending_reconcile.json",
    );
  });

  it("writes the staged handoff via a temp sibling then rename, leaving no temp behind", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-pending-"));
    const pending = path.join(dir, "store", "drift_pending_reconcile.json");
    try {
      write_pending_reconcile_atomic(pending, handoff(["src/a.ts", "src/b.ts"], SESSION));
      expect(parse_pending_reconcile(fs.readFileSync(pending, "utf8"))).toEqual(
        handoff(["src/a.ts", "src/b.ts"], SESSION),
      );
      expect(fs.readdirSync(path.dirname(pending))).toEqual(["drift_pending_reconcile.json"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("replaces an existing pending file in place", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-pending-"));
    const pending = path.join(dir, "drift_pending_reconcile.json");
    try {
      fs.writeFileSync(pending, serialize_pending_reconcile(handoff(["src/old.ts"])));
      write_pending_reconcile_atomic(pending, handoff(["src/new.ts"]));
      expect(parse_pending_reconcile(fs.readFileSync(pending, "utf8"))).toEqual(handoff(["src/new.ts"]));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws (and removes its temp file) when the rename target cannot be replaced", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-pending-"));
    const pending = path.join(dir, "drift_pending_reconcile.json");
    try {
      fs.mkdirSync(pending); // a directory at the target path defeats rename-over
      expect(() => write_pending_reconcile_atomic(pending, handoff(["src/a.ts"]))).toThrow();
      expect(fs.readdirSync(dir)).toEqual(["drift_pending_reconcile.json"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
