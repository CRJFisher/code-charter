import { describe, expect, it } from "@jest/globals";

import { build_symbol_path, compute_content_hash, compute_span_hash, derive_code_state } from "./code_state";
import type { ResolverSymbol } from "./resolver_symbol";

describe("build_symbol_path", () => {
  it("qualifies with the enclosing chain and tags the kind", () => {
    expect(build_symbol_path("src/s.ts", ["X"], "run", "method")).toBe("src/s.ts#X.run:method");
    expect(build_symbol_path("src/s.ts", [], "top", "function")).toBe("src/s.ts#top:function");
    expect(build_symbol_path("src/s.ts", ["Outer", "Inner"], "go", "method")).toBe("src/s.ts#Outer.Inner.go:method");
  });

  it("distinguishes same-named symbols by enclosing class and by kind", () => {
    expect(build_symbol_path("src/s.ts", ["X"], "run", "method")).not.toBe(build_symbol_path("src/s.ts", ["Y"], "run", "method"));
    expect(build_symbol_path("src/s.ts", ["X"], "run", "method")).not.toBe(build_symbol_path("src/s.ts", ["X"], "run", "property"));
  });
});

describe("compute_content_hash", () => {
  it("ignores leading/trailing whitespace", () => {
    expect(compute_content_hash("  { return 1; }  ", "fn")).toBe(compute_content_hash("{ return 1; }", "fn"));
  });

  it("is stable across a pure rename, including recursive self-calls", () => {
    // foo -> bar changes only the identifier; stripping every whole-word occurrence makes the hash equal.
    const before = compute_content_hash("{ return foo(x) + 1; }", "foo");
    const after = compute_content_hash("{ return bar(x) + 1; }", "bar");
    expect(after).toBe(before);
  });

  it("only strips whole-word occurrences, not substrings", () => {
    // "foo" must not be stripped out of "foobar".
    expect(compute_content_hash("{ return foobar(); }", "foo")).toBe(compute_content_hash("{ return foobar(); }", "zzz"));
  });

  it("handles identifiers containing regex metacharacters", () => {
    const before = compute_content_hash("{ return $fn(x); }", "$fn");
    const after = compute_content_hash("{ return $other(x); }", "$other");
    expect(after).toBe(before);
  });

  it("is a full 64-char lowercase hex digest", () => {
    expect(compute_content_hash("{ return 1; }", "fn")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("compute_span_hash", () => {
  it("hashes the exact span — whitespace- and identifier-sensitive, unlike content_hash", () => {
    const body = "  return foo();  ";
    expect(compute_span_hash(body)).not.toBe(compute_content_hash(body, "foo"));
    expect(compute_span_hash(body)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("derive_code_state", () => {
  it("assembles the whole triple from a symbol", () => {
    const symbol: ResolverSymbol = {
      file_path: "src/s.ts",
      name: "run",
      kind: "method",
      enclosing: ["X"],
      body_source: "{ return this.x; }",
    };
    expect(derive_code_state(symbol)).toEqual({
      symbol_path: "src/s.ts#X.run:method",
      content_hash: compute_content_hash(symbol.body_source, "run"),
      span_hash: compute_span_hash(symbol.body_source),
    });
  });
});
