import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  append_reconcile_log,
  make_run_id,
  read_latest_reconcile_record,
  read_sync_status,
  reconcile_log_path,
  sync_status_path,
  update_sync_status,
  RECONCILE_RECORD_SCHEMA_VERSION,
  type ReconcileRunRecord,
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

function record(over: Partial<ReconcileRunRecord> = {}): ReconcileRunRecord {
  return {
    schema_version: RECONCILE_RECORD_SCHEMA_VERSION,
    run_id: "20260707T000000000Z-00000000",
    session_id: "s1",
    transcript_path: "/home/.claude/projects/-repo/s1.jsonl",
    instruction: "Launch the `drift-reconciler` sub-agent.",
    timestamp: "2026-07-07T00:00:00.000Z",
    detail: {
      mode: "default",
      file_set: ["main.ts"],
      outcomes: [],
      deferred_retirements: [],
      deferred_skill_syncs: [],
      description_counts: { docstring: 0, provisional: 0, placeholder: 0, llm: 0 },
      diagnostics: [],
    },
    ...over,
  };
}

describe("append_reconcile_log", () => {
  it("puts the log beside the store and appends one JSON line per record", () => {
    append_reconcile_log(store_path, record(), () => {});
    append_reconcile_log(store_path, record({ detail: { ...record().detail, file_set: ["other.ts"] } }), () => {});

    const log_path = reconcile_log_path(store_path);
    expect(path.dirname(log_path)).toBe(dir);
    const lines = fs.readFileSync(log_path, "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect((JSON.parse(lines[0]) as ReconcileRunRecord).detail.file_set).toEqual(["main.ts"]);
    expect((JSON.parse(lines[1]) as ReconcileRunRecord).detail.file_set).toEqual(["other.ts"]);
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

describe("read_latest_reconcile_record", () => {
  it("returns the newest current-schema record", () => {
    append_reconcile_log(store_path, record({ run_id: "old" }), () => {});
    append_reconcile_log(store_path, record({ run_id: "new" }), () => {});

    expect(read_latest_reconcile_record(store_path)?.run_id).toBe("new");
  });

  it("skips foreign-schema and pre-contract flat lines instead of migrating them", () => {
    const log_path = reconcile_log_path(store_path);
    fs.mkdirSync(dir, { recursive: true });
    const flat_legacy = JSON.stringify({ timestamp: "t", mode: "default", file_set: ["legacy.ts"] });
    const foreign = JSON.stringify({ ...record({ run_id: "future" }), schema_version: 999 });
    fs.writeFileSync(log_path, `${JSON.stringify(record({ run_id: "current" }))}\n${flat_legacy}\n${foreign}\n`);

    expect(read_latest_reconcile_record(store_path)?.run_id).toBe("current");
  });

  it("returns null when no line carries the current schema", () => {
    const log_path = reconcile_log_path(store_path);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(log_path, JSON.stringify({ timestamp: "t", mode: "default" }) + "\n");

    expect(read_latest_reconcile_record(store_path)).toBeNull();
  });

  it("skips a version-stamped line whose detail is missing, so consumers can dot into detail safely", () => {
    const log_path = reconcile_log_path(store_path);
    fs.mkdirSync(dir, { recursive: true });
    const detail_less = JSON.stringify({ schema_version: RECONCILE_RECORD_SCHEMA_VERSION, run_id: "bogus" });
    fs.writeFileSync(log_path, `${JSON.stringify(record({ run_id: "good" }))}\n${detail_less}\n`);

    expect(read_latest_reconcile_record(store_path)?.run_id).toBe("good");
  });
});

describe("make_run_id", () => {
  it("compacts the timestamp into a sortable prefix and appends a hex suffix", () => {
    expect(make_run_id("2026-07-10T14:03:55.123Z")).toMatch(/^20260710T140355123Z-[0-9a-f]{8}$/);
  });

  it("mints distinct ids for the same instant", () => {
    expect(make_run_id("2026-07-10T14:03:55.123Z")).not.toBe(make_run_id("2026-07-10T14:03:55.123Z"));
  });
});

describe("run-record contract (docs/contracts/reconcile_run_record.md)", () => {
  it("partitions mechanism-agnostic keys at the top level and drift payload under detail", () => {
    expect(Object.keys(record()).sort()).toEqual([
      "detail",
      "instruction",
      "run_id",
      "schema_version",
      "session_id",
      "timestamp",
      "transcript_path",
    ]);
    expect(Object.keys(record().detail).sort()).toEqual([
      "deferred_retirements",
      "deferred_skill_syncs",
      "description_counts",
      "diagnostics",
      "file_set",
      "mode",
      "outcomes",
    ]);
  });

  it("the pinned contract doc's version matches the code constant", () => {
    const doc = fs.readFileSync(
      path.resolve(__dirname, "..", "..", "docs", "contracts", "reconcile_run_record.md"),
      "utf8",
    );
    expect(doc).toMatch(new RegExp(`^contract_version: ${RECONCILE_RECORD_SCHEMA_VERSION}$`, "m"));
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
