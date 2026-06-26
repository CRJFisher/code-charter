import { describe, expect, it } from "@jest/globals";

import { derive_code_state } from "./code_state";
import { build_resolver_index } from "./resolver_index";
import {
  cls_x_run,
  cls_y_run,
  fn_a,
  fn_a_moved,
  fn_a_renamed,
} from "./__fixtures__/resolver_symbols";

describe("build_resolver_index", () => {
  it("indexes each symbol by its derived symbol_path", () => {
    const index = build_resolver_index([fn_a, cls_x_run]);

    expect(index.by_symbol_path.get(derive_code_state(fn_a).symbol_path)).toEqual(derive_code_state(fn_a));
    expect(index.by_symbol_path.get(derive_code_state(cls_x_run).symbol_path)).toEqual(
      derive_code_state(cls_x_run),
    );
    expect(index.by_symbol_path.size).toBe(2);
  });

  it("buckets every state that shares a content_hash under that hash", () => {
    const index = build_resolver_index([fn_a, fn_a_renamed, fn_a_moved]);
    const shared_hash = derive_code_state(fn_a).content_hash;

    expect(derive_code_state(fn_a_renamed).content_hash).toBe(shared_hash);
    expect(derive_code_state(fn_a_moved).content_hash).toBe(shared_hash);
    expect(index.by_content_hash.get(shared_hash)).toEqual([
      derive_code_state(fn_a),
      derive_code_state(fn_a_renamed),
      derive_code_state(fn_a_moved),
    ]);
  });

  it("sorts each content_hash bucket by symbol_path regardless of input order", () => {
    const ascending = build_resolver_index([fn_a, fn_a_moved, fn_a_renamed]);
    const descending = build_resolver_index([fn_a_renamed, fn_a_moved, fn_a]);
    const shared_hash = derive_code_state(fn_a).content_hash;

    const sorted_paths = [
      derive_code_state(fn_a).symbol_path,
      derive_code_state(fn_a_renamed).symbol_path,
      derive_code_state(fn_a_moved).symbol_path,
    ];
    expect(ascending.by_content_hash.get(shared_hash)?.map((s) => s.symbol_path)).toEqual(sorted_paths);
    expect(descending.by_content_hash.get(shared_hash)?.map((s) => s.symbol_path)).toEqual(sorted_paths);
  });

  it("keeps states with distinct content_hashes in separate buckets", () => {
    const index = build_resolver_index([fn_a, cls_x_run]);

    expect(index.by_content_hash.get(derive_code_state(fn_a).content_hash)).toEqual([derive_code_state(fn_a)]);
    expect(index.by_content_hash.get(derive_code_state(cls_x_run).content_hash)).toEqual([
      derive_code_state(cls_x_run),
    ]);
  });

  it("yields empty maps for an empty symbol set", () => {
    const index = build_resolver_index([]);

    expect(index.by_symbol_path.size).toBe(0);
    expect(index.by_content_hash.size).toBe(0);
  });

  it("throws on a duplicate symbol_path rather than silently overwriting", () => {
    expect(() => build_resolver_index([fn_a, fn_a])).toThrow(/duplicate symbol_path/);
  });

  it("distinguishes same-named methods on different classes", () => {
    const index = build_resolver_index([cls_x_run, cls_y_run]);

    expect(index.by_symbol_path.size).toBe(2);
    expect(derive_code_state(cls_x_run).symbol_path).not.toEqual(derive_code_state(cls_y_run).symbol_path);
  });
});
