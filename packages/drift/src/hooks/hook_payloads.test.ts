import { describe, expect, it } from "@jest/globals";

import { is_record, is_stop_hook_input } from "./hook_payloads";

describe("is_record", () => {
  it("accepts plain objects", () => {
    expect(is_record({ a: 1 })).toBe(true);
  });

  it("accepts arrays", () => {
    expect(is_record([1, 2])).toBe(true);
  });

  it("rejects null", () => {
    expect(is_record(null)).toBe(false);
  });

  it("rejects primitives", () => {
    expect(is_record("x")).toBe(false);
    expect(is_record(42)).toBe(false);
    expect(is_record(undefined)).toBe(false);
  });
});

describe("is_stop_hook_input", () => {
  it("accepts a record carrying a string transcript_path", () => {
    expect(is_stop_hook_input({ transcript_path: "/tmp/transcript.jsonl" })).toBe(true);
  });

  it("rejects a record missing transcript_path", () => {
    expect(is_stop_hook_input({ session_id: "abc" })).toBe(false);
  });

  it("rejects a record whose transcript_path is not a string", () => {
    expect(is_stop_hook_input({ transcript_path: 123 })).toBe(false);
  });

  it("rejects non-record values", () => {
    expect(is_stop_hook_input(null)).toBe(false);
    expect(is_stop_hook_input("/tmp/transcript.jsonl")).toBe(false);
  });
});
