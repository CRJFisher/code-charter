import type { AnyDefinition } from "@code-charter/types";

import { make_node } from "../model/__fixtures__/call_graph";
import { DEFAULT_DESCRIBE_CAP, plan_descriptions } from "./describe_policy";
import type { DescribeMember, ExistingDescription } from "./describe_policy";

/** A DescribeMember whose definition optionally carries a docstring. */
function member(symbol_path: string, opts: { content_hash?: string; docstring?: string } = {}): DescribeMember {
  const base = make_node({ id: symbol_path, name: symbol_path, file: "f.ts" }).definition;
  if (base.kind !== "function") throw new Error("fixture definition must be a function");
  const definition: AnyDefinition = opts.docstring === undefined ? base : { ...base, docstring: opts.docstring };
  return {
    symbol_path,
    content_hash: opts.content_hash ?? "h",
    name: symbol_path,
    definition,
  };
}

describe("plan_descriptions (AC#3)", () => {
  it("uses an Ariadne docstring with no LLM request", () => {
    const plan = plan_descriptions([member("a", { docstring: "adds two numbers" })]);
    expect(plan.from_docstring).toEqual([
      { symbol_path: "a", content_hash: "h", name: "a", source: "docstring", text: "adds two numbers" },
    ]);
    expect(plan.needs_llm).toHaveLength(0);
  });

  it("skips a member already described at its current content_hash", () => {
    const existing = new Map<string, ExistingDescription>([["a", { described_at_content_hash: "h" }]]);
    const plan = plan_descriptions([member("a", { content_hash: "h" })], { existing });
    expect(plan.cached).toEqual(["a"]);
    expect(plan.needs_llm).toHaveLength(0);
    expect(plan.from_docstring).toHaveLength(0);
  });

  it("re-plans a member whose content_hash changed since it was described", () => {
    const existing = new Map<string, ExistingDescription>([["a", { described_at_content_hash: "old" }]]);
    const plan = plan_descriptions([member("a", { content_hash: "new" })], { existing });
    expect(plan.cached).toHaveLength(0);
    expect(plan.needs_llm.map((p) => p.symbol_path)).toEqual(["a"]);
  });

  it("caps LLM candidates and turns the rest into name placeholders", () => {
    const members = [member("c"), member("a"), member("b")];
    const plan = plan_descriptions(members, { cap: 2 });
    expect(plan.needs_llm.map((p) => p.symbol_path)).toEqual(["a", "b"]); // lowest symbol_paths
    expect(plan.placeholder).toEqual([{ symbol_path: "c", content_hash: "h", name: "c", source: "placeholder", text: "c" }]);
    expect(plan.truncation).toEqual({ cap: 2, over_cap_count: 1 });
  });

  it("does not let docstring members consume the cap", () => {
    const plan = plan_descriptions([member("a", { docstring: "doc" }), member("b"), member("c")], { cap: 1 });
    expect(plan.needs_llm.map((p) => p.symbol_path)).toEqual(["b"]);
    expect(plan.placeholder.map((p) => p.symbol_path)).toEqual(["c"]);
  });

  it("defaults the cap to 200", () => {
    expect(DEFAULT_DESCRIBE_CAP).toBe(200);
  });

  it("is deterministic regardless of input order", () => {
    const a = plan_descriptions([member("c"), member("a"), member("b")], { cap: 1 });
    const b = plan_descriptions([member("b"), member("c"), member("a")], { cap: 1 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

});
