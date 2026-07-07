import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  append_reconcile_log,
  read_sync_status,
  reconcile_log_path,
  sync_status_path,
  update_sync_status,
  type ReconcileLogRecord,
} from "./reconcile_log";

let dir: string;
let store_path: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-log-"));
  store_path = path.join(dir, "graph.db");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function record(over: Partial<ReconcileLogRecord> = {}): ReconcileLogRecord {
  return {
    timestamp: "2026-07-07T00:00:00.000Z",
    mode: "default",
    file_set: ["main.ts"],
    outcomes: [],
    deferred_retirements: [],
    description_counts: { docstring: 0, placeholder: 0, llm: 0 },
    diagnostics: [],
    ...over,
  };
}

describe("append_reconcile_log", () => {
  it("puts the log beside the store and appends one JSON line per record", () => {
    append_reconcile_log(store_path, record(), () => {});
    append_reconcile_log(store_path, record({ file_set: ["other.ts"] }), () => {});

    const log_path = reconcile_log_path(store_path);
    expect(path.dirname(log_path)).toBe(dir);
    const lines = fs.readFileSync(log_path, "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect((JSON.parse(lines[0]) as ReconcileLogRecord).file_set).toEqual(["main.ts"]);
    expect((JSON.parse(lines[1]) as ReconcileLogRecord).file_set).toEqual(["other.ts"]);
  });

  it("a write failure degrades to a diagnostic and never throws", () => {
    // A store path whose parent is a FILE makes every mkdir/append fail.
    const blocker = path.join(dir, "blocker");
    fs.writeFileSync(blocker, "");
    const messages: string[] = [];

    expect(() => append_reconcile_log(path.join(blocker, "graph.db"), record(), (m) => messages.push(m))).not.toThrow();
    expect(messages).toContainEqual(expect.stringContaining("drift_reconcile_log.jsonl"));
  });
});

describe("update_sync_status", () => {
  it("puts the status beside the store and round-trips through read_sync_status", () => {
    update_sync_status(store_path, { last_attempt_at: "t1" }, () => {});

    expect(path.dirname(sync_status_path(store_path))).toBe(dir);
    expect(read_sync_status(store_path)).toEqual({ last_attempt_at: "t1", last_success_at: null, last_error: null });
  });

  it("merges onto the prior status so success and error survive runs that do not set them", () => {
    update_sync_status(store_path, { last_attempt_at: "t1", last_success_at: "t1" }, () => {});
    update_sync_status(store_path, { last_attempt_at: "t2", last_error: { at: "t2", message: "boom" } }, () => {});

    expect(read_sync_status(store_path)).toEqual({
      last_attempt_at: "t2",
      last_success_at: "t1",
      last_error: { at: "t2", message: "boom" },
    });
  });

  it("an unparsable status file reads as the empty status and is overwritten on the next update", () => {
    fs.writeFileSync(sync_status_path(store_path), "not json");

    expect(read_sync_status(store_path)).toEqual({ last_attempt_at: null, last_success_at: null, last_error: null });
    update_sync_status(store_path, { last_attempt_at: "t1" }, () => {});
    expect(read_sync_status(store_path).last_attempt_at).toBe("t1");
  });

  it("a write failure degrades to a diagnostic and never throws", () => {
    const blocker = path.join(dir, "blocker");
    fs.writeFileSync(blocker, "");
    const messages: string[] = [];

    expect(() =>
      update_sync_status(path.join(blocker, "graph.db"), { last_attempt_at: "t1" }, (m) => messages.push(m)),
    ).not.toThrow();
    expect(messages).toContainEqual(expect.stringContaining("drift_reconcile_status.json"));
  });
});
