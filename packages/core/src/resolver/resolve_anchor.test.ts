import { describe, expect, it } from "@jest/globals";

import { derive_code_state } from "./code_state";
import { resolve_anchor } from "./resolve_anchor";
import { build_resolver_index } from "./resolver_index";
import type { ResolverSymbol } from "./resolver_symbol";
import {
  anchor_of,
  cls_x_run,
  cls_y_run,
  fn_a,
  fn_a_body_changed,
  fn_a_moved,
  fn_a_renamed,
  fn_a_renamed_and_changed,
} from "./__fixtures__/resolver_symbols";

describe("resolve_anchor — the verdict cascade", () => {
  it("hit — symbol_path and content_hash both match, carrying the whole CodeState", () => {
    const index = build_resolver_index([fn_a]);
    const result = resolve_anchor(anchor_of(fn_a), index);

    expect(result).toEqual({ status: "hit", state: derive_code_state(fn_a) });
    // The hit arm carries the full triple, including span_hash.
    if (result.status !== "hit") throw new Error("unreachable");
    expect(result.state.span_hash).toEqual(derive_code_state(fn_a).span_hash);
  });

  it("downgrade/body-changed — symbol_path matches, content_hash differs", () => {
    const index = build_resolver_index([fn_a_body_changed]);
    const result = resolve_anchor(anchor_of(fn_a), index);

    expect(result).toEqual({
      status: "downgrade",
      reason: "body-changed",
      state: derive_code_state(fn_a_body_changed),
    });
  });

  it("downgrade/relocated — same-file rename, content matches at a new symbol_path", () => {
    const index = build_resolver_index([fn_a_renamed]);
    const result = resolve_anchor(anchor_of(fn_a), index);

    expect(result).toEqual({
      status: "downgrade",
      reason: "relocated",
      state: derive_code_state(fn_a_renamed),
    });
  });

  it("downgrade/relocated — cross-file move, content matches in a different file", () => {
    const index = build_resolver_index([fn_a_moved]);
    const result = resolve_anchor(anchor_of(fn_a), index);

    expect(result).toEqual({
      status: "downgrade",
      reason: "relocated",
      state: derive_code_state(fn_a_moved),
    });
  });

  it("miss — a simultaneous rename + body-change resolves to nothing", () => {
    const index = build_resolver_index([fn_a_renamed_and_changed]);
    const result = resolve_anchor(anchor_of(fn_a), index);

    expect(result).toEqual({ status: "miss" });
    expect("state" in result).toBe(false);
  });

  it("two same-named methods in one file resolve to distinct symbol_paths", () => {
    const index = build_resolver_index([cls_x_run, cls_y_run]);

    const x = resolve_anchor(anchor_of(cls_x_run), index);
    const y = resolve_anchor(anchor_of(cls_y_run), index);

    expect(x).toEqual({ status: "hit", state: derive_code_state(cls_x_run) });
    expect(y).toEqual({ status: "hit", state: derive_code_state(cls_y_run) });
    expect(derive_code_state(cls_x_run).symbol_path).not.toEqual(derive_code_state(cls_y_run).symbol_path);
  });
});

describe("resolve_anchor — cascade ordering and determinism", () => {
  it("hit wins over relocated when a same-body copy also exists elsewhere", () => {
    // fn_a at src/a.ts and fn_a_moved at src/moved.ts share a content_hash.
    const index = build_resolver_index([fn_a, fn_a_moved]);
    const result = resolve_anchor(anchor_of(fn_a), index);

    expect(result.status).toBe("hit");
  });

  it("body-changed wins over relocated when the old body lives on elsewhere", () => {
    // The anchor's body (fn_a) still exists at src/moved.ts, but its own symbol_path now holds a
    // changed body — that must report body-changed, not relocate to the surviving copy.
    const index = build_resolver_index([fn_a_body_changed, fn_a_moved]);
    const result = resolve_anchor(anchor_of(fn_a), index);

    expect(result).toEqual({
      status: "downgrade",
      reason: "body-changed",
      state: derive_code_state(fn_a_body_changed),
    });
  });

  it("relocated picks the smallest symbol_path deterministically among duplicate bodies", () => {
    // Both candidates share fn_a's content_hash; src/a.ts... sorts before src/moved.ts...
    const index = build_resolver_index([fn_a_renamed, fn_a_moved]);
    const result = resolve_anchor(anchor_of(fn_a), index);

    expect(result).toEqual({
      status: "downgrade",
      reason: "relocated",
      state: derive_code_state(fn_a_renamed),
    });
  });

  it("an empty index resolves to miss", () => {
    expect(resolve_anchor(anchor_of(fn_a), build_resolver_index([]))).toEqual({ status: "miss" });
  });

  it("symbol_path wins when two bodies collide on content_hash via the lexical name strip", () => {
    // Bodies differ only by each symbol's own name, so both normalize to the same content_hash.
    const sym_x: ResolverSymbol = { file_path: "src/c.ts", name: "x", kind: "function", enclosing: [], body_source: "{ return x; }" };
    const sym_y: ResolverSymbol = { file_path: "src/c.ts", name: "y", kind: "function", enclosing: [], body_source: "{ return y; }" };
    expect(derive_code_state(sym_x).content_hash).toBe(derive_code_state(sym_y).content_hash);

    const index = build_resolver_index([sym_x, sym_y]);
    // Each still resolves to ITSELF — the exact symbol_path arm precedes the content_hash arm.
    expect(resolve_anchor(anchor_of(sym_x), index)).toEqual({ status: "hit", state: derive_code_state(sym_x) });
    expect(resolve_anchor(anchor_of(sym_y), index)).toEqual({ status: "hit", state: derive_code_state(sym_y) });
  });
});
