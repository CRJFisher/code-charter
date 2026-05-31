import { describe, expect, it } from "@jest/globals";

import type { Anchor } from "@code-charter/types";

import { format_anchor, parse_anchor } from "./anchor_string";

const HASH = "a".repeat(64);

describe("anchor_string round-trip", () => {
  it("round-trips a symbol_path that itself contains colons", () => {
    // symbol_path ends with `:method`; the split must key on the LAST colon.
    const anchor: Anchor = { symbol_path: "src/s.ts#X.run:method", content_hash: HASH };
    expect(format_anchor(anchor)).toBe(`src/s.ts#X.run:method:${HASH}`);
    expect(parse_anchor(format_anchor(anchor))).toEqual(anchor);
  });

  it("format ∘ parse is the identity on a canonical string", () => {
    const s = `src/a.ts#top:function:${HASH}`;
    expect(format_anchor(parse_anchor(s))).toBe(s);
  });
});

describe("parse_anchor validation", () => {
  it("rejects a string with no colon", () => {
    expect(() => parse_anchor("no-separator")).toThrow(/no ':' separator/);
  });

  it("rejects a non-hex or wrong-length content_hash", () => {
    expect(() => parse_anchor("src/a.ts#top:function:not-a-hash")).toThrow(/not a 64-char/);
    expect(() => parse_anchor(`src/a.ts#top:function:${"a".repeat(63)}`)).toThrow(/not a 64-char/);
    expect(() => parse_anchor(`src/a.ts#top:function:${"A".repeat(64)}`)).toThrow(/not a 64-char/);
  });

  it("rejects an empty symbol_path", () => {
    expect(() => parse_anchor(`:${HASH}`)).toThrow(/empty symbol_path/);
  });
});
