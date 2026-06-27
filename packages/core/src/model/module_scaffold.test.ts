import type { NodeRow } from "@code-charter/types";

import { format_anchor } from "../resolver";
import {
  build_module_scaffold,
  EXTERNAL_GROUP_ID,
  EXTERNAL_GROUP_LABEL,
  file_module_resolver,
  file_of_symbol_path,
  module_group_id,
  MODULE_GROUP_PREFIX,
  path_module_resolver,
} from "./module_scaffold";

/** A valid 64-char lowercase hex sha256, required by parse_anchor (content_hash is irrelevant here). */
const HASH = "a".repeat(64);

/** A leaf code node anchored to `symbol_path` (content_hash is irrelevant to bucketing). */
function leaf(symbol_path: string, over: Partial<NodeRow> = {}): NodeRow {
  return {
    id: symbol_path,
    kind: "code.function",
    path: file_of_symbol_path(symbol_path),
    anchor: format_anchor({ symbol_path, content_hash: HASH }),
    layer: "raw",
    attributes: {},
    field_ownership: {},
    origin: "ariadne",
    intent_source: "code-edit",
    deleted_at: null,
    ...over,
  };
}

describe("file_of_symbol_path", () => {
  it("returns the segment before the first '#'", () => {
    expect(file_of_symbol_path("src/app.ts#Foo.bar:method")).toBe("src/app.ts");
  });

  it("throws on a symbol_path with no file separator", () => {
    expect(() => file_of_symbol_path("nofile")).toThrow(/no '#' file separator/);
  });
});

describe("module_group_id", () => {
  it("is path-derived and stable (no hash)", () => {
    expect(module_group_id("src/app.ts")).toBe(`${MODULE_GROUP_PREFIX}src/app.ts`);
    expect(module_group_id("src/app.ts")).toBe(module_group_id("src/app.ts"));
  });
});

describe("build_module_scaffold (AC#9)", () => {
  const resolver = file_module_resolver("src");

  it("emits one agentic.group per defining file, layer='agentic'", () => {
    const scaffold = build_module_scaffold(
      [leaf("src/app.ts#a:function"), leaf("src/app.ts#b:function"), leaf("src/util.ts#c:function")],
      resolver,
    );

    expect(scaffold.module_nodes).toHaveLength(2);
    expect(scaffold.module_nodes.map((n) => n.id)).toEqual([
      module_group_id("src/app.ts"),
      module_group_id("src/util.ts"),
    ]);
    for (const node of scaffold.module_nodes) {
      expect(node.kind).toBe("agentic.group");
      expect(node.layer).toBe("agentic");
      expect(node.anchor).toBeNull();
      expect(node.attributes.group_kind).toBe("file-module");
    }
    expect(scaffold.module_nodes[0].attributes.label).toBe("src/app.ts");
  });

  it("emits one agentic.contains edge per leaf, directed leaf -> module", () => {
    const scaffold = build_module_scaffold([leaf("src/app.ts#a:function"), leaf("src/app.ts#b:function")], resolver);

    expect(scaffold.contains_edges).toHaveLength(2);
    const group = module_group_id("src/app.ts");
    for (const edge of scaffold.contains_edges) {
      expect(edge.kind).toBe("agentic.contains");
      expect(edge.layer).toBe("agentic");
      expect(edge.dst_id).toBe(group);
      expect(edge.confidence).toBe(1);
    }
    expect(scaffold.contains_edges.map((e) => e.src_id)).toEqual(["src/app.ts#a:function", "src/app.ts#b:function"]);
  });

  it("buckets files outside the analyzed root under a single <external> group", () => {
    const scaffold = build_module_scaffold(
      [leaf("src/app.ts#a:function"), leaf("vendor/x.ts#v:function"), leaf("vendor/y.ts#w:function")],
      resolver,
    );

    const ids = scaffold.module_nodes.map((n) => n.id);
    expect(ids).toContain(EXTERNAL_GROUP_ID);
    const external = scaffold.module_nodes.find((n) => n.id === EXTERNAL_GROUP_ID)!;
    expect(external.attributes.label).toBe(EXTERNAL_GROUP_LABEL);
    expect(external.path).toBe("");
    expect(scaffold.contains_edges.filter((e) => e.dst_id === EXTERNAL_GROUP_ID)).toHaveLength(2);
  });

  it("skips anchorless leaves (no group, no edge)", () => {
    const scaffold = build_module_scaffold([leaf("src/app.ts#a:function", { anchor: null })], resolver);
    expect(scaffold.module_nodes).toEqual([]);
    expect(scaffold.contains_edges).toEqual([]);
  });

  it("is order-independent and deterministic on recompute", () => {
    const leaves = [leaf("src/util.ts#c:function"), leaf("src/app.ts#b:function"), leaf("src/app.ts#a:function")];
    const first = build_module_scaffold(leaves, resolver);
    const second = build_module_scaffold([...leaves].reverse(), resolver);
    expect(second).toEqual(first);
  });

  it("treats an empty analyzed root as containing everything", () => {
    const whole_repo = file_module_resolver("");
    const scaffold = build_module_scaffold([leaf("vendor/x.ts#v:function")], whole_repo);
    expect(scaffold.module_nodes[0].id).toBe(module_group_id("vendor/x.ts"));
  });

  it("strips a trailing slash from the analyzed root when testing containment", () => {
    const scaffold = build_module_scaffold(
      [leaf("src/app.ts#a:function"), leaf("vendor/x.ts#v:function")],
      file_module_resolver("src/"),
    );
    expect(scaffold.module_nodes.map((n) => n.id)).toEqual([EXTERNAL_GROUP_ID, module_group_id("src/app.ts")]);
  });
});

describe("path_module_resolver", () => {
  const resolver = path_module_resolver("src");

  it("buckets anchorless projected rows by their path column", () => {
    const scaffold = build_module_scaffold(
      [leaf("src/app.ts#a:function", { anchor: null }), leaf("src/app.ts#b:function", { anchor: null })],
      resolver,
    );
    expect(scaffold.module_nodes.map((n) => n.id)).toEqual([module_group_id("src/app.ts")]);
    expect(scaffold.contains_edges).toHaveLength(2);
  });

  it("yields group ids byte-identical to the anchor-parsing resolver", () => {
    const leaves = [leaf("src/app.ts#a:function"), leaf("vendor/x.ts#v:function")];
    const by_path = build_module_scaffold(leaves, path_module_resolver("src"));
    const by_anchor = build_module_scaffold(leaves, file_module_resolver("src"));
    expect(by_path.module_nodes.map((n) => n.id)).toEqual(by_anchor.module_nodes.map((n) => n.id));
  });

  it("skips rows with an empty path (no group, no edge)", () => {
    const scaffold = build_module_scaffold([leaf("src/app.ts#a:function", { path: "" })], resolver);
    expect(scaffold.module_nodes).toEqual([]);
    expect(scaffold.contains_edges).toEqual([]);
  });

  it("buckets paths outside the analyzed root under the single <external> group", () => {
    const scaffold = build_module_scaffold(
      [leaf("vendor/x.ts#v:function"), leaf("vendor/y.ts#w:function")],
      resolver,
    );
    expect(scaffold.module_nodes.map((n) => n.id)).toEqual([EXTERNAL_GROUP_ID]);
    expect(scaffold.contains_edges.filter((e) => e.dst_id === EXTERNAL_GROUP_ID)).toHaveLength(2);
  });
});
