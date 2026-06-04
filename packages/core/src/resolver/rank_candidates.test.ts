import { describe, expect, it } from "@jest/globals";

import type { Anchor } from "@code-charter/types";

import { rank_candidates } from "./rank_candidates";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

/** The stranded description's original anchor: `compute` in `src/calc.ts`, body hash A. */
const STRANDED: Anchor = { symbol_path: "src/calc.ts#compute:function", content_hash: HASH_A };

function live(symbol_path: string, content_hash: string): Anchor {
  return { symbol_path, content_hash };
}

describe("rank_candidates", () => {
  it("ranks a content_hash match first (the same body is anchored there)", () => {
    const ranked = rank_candidates(STRANDED, [
      live("src/other.ts#renamed:function", HASH_A), // same body anchored in another file
      live("src/calc.ts#unrelated:function", HASH_B), // same file, different body/name
    ]);
    expect(ranked[0]).toMatchObject({ symbol_path: "src/other.ts#renamed:function", reason: "content-match" });
    expect(ranked[0].score).toBeGreaterThanOrEqual(100);
  });

  it("ranks a same-file candidate above a different-file same-name candidate", () => {
    const ranked = rank_candidates(STRANDED, [
      live("src/calc.ts#calculate:function", HASH_B), // same file, renamed (no body match)
      live("src/elsewhere.ts#compute:function", HASH_C), // different file, same leaf name+kind
    ]);
    expect(ranked.map((c) => c.symbol_path)).toEqual([
      "src/calc.ts#calculate:function",
      "src/elsewhere.ts#compute:function",
    ]);
    expect(ranked[0].reason).toBe("same-file");
    expect(ranked[1].reason).toBe("name-match");
  });

  it("adds same-file and name-match signals so a same-file same-name target outranks same-file-only", () => {
    const ranked = rank_candidates(STRANDED, [
      live("src/calc.ts#helper:function", HASH_B), // same file only (10)
      live("src/calc.ts#compute:method", HASH_C), // same file, same leaf name, different kind ⇒ still 10
      live("src/calc.ts#Helper.compute:function", HASH_C), // same file + same leaf name + same kind ⇒ 15
    ]);
    expect(ranked[0]).toMatchObject({ symbol_path: "src/calc.ts#Helper.compute:function", score: 15 });
  });

  it("breaks ties deterministically by symbol_path and is order-independent", () => {
    const targets = [
      live("src/calc.ts#zeta:function", HASH_B),
      live("src/calc.ts#alpha:function", HASH_B),
      live("src/calc.ts#mid:function", HASH_B),
    ];
    const forward = rank_candidates(STRANDED, targets).map((c) => c.symbol_path);
    const reversed = rank_candidates(STRANDED, [...targets].reverse()).map((c) => c.symbol_path);
    expect(forward).toEqual([
      "src/calc.ts#alpha:function",
      "src/calc.ts#mid:function",
      "src/calc.ts#zeta:function",
    ]);
    expect(reversed).toEqual(forward);
  });

  it("never returns the stranded symbol itself", () => {
    const ranked = rank_candidates(STRANDED, [
      live("src/calc.ts#compute:function", HASH_A), // identical to stranded
      live("src/calc.ts#calculate:function", HASH_B),
    ]);
    expect(ranked.map((c) => c.symbol_path)).toEqual(["src/calc.ts#calculate:function"]);
  });

  it("drops zero-signal anchors (different file, name, and body)", () => {
    const ranked = rank_candidates(STRANDED, [live("src/elsewhere.ts#unrelated:function", HASH_B)]);
    expect(ranked).toEqual([]);
  });

  it("caps the result at the limit, keeping the strongest", () => {
    const targets = Array.from({ length: 8 }, (_, i) => live(`src/calc.ts#fn${i}:function`, HASH_B));
    targets.push(live("src/calc.ts#moved:function", HASH_A)); // the relocation, score 110
    const ranked = rank_candidates(STRANDED, targets, { limit: 3 });
    expect(ranked).toHaveLength(3);
    expect(ranked[0]).toMatchObject({ symbol_path: "src/calc.ts#moved:function", reason: "content-match" });
  });

  it("returns [] for an empty live set", () => {
    expect(rank_candidates(STRANDED, [])).toEqual([]);
  });
});
