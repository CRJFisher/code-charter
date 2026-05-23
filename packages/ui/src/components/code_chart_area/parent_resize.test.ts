import { compute_parent_resize, apply_parent_resize } from "./parent_resize";
import { CONFIG } from "./chart_config";
import type { CodeChartNode, CodeFunctionNodeType, ModuleGroupNodeType } from "./chart_types";

const PAD = CONFIG.layout.module.innerPadding;
const PAD_TOP = PAD + CONFIG.layout.module.headerHeight;

function expect_present<T>(v: T | null | undefined): T {
  if (v == null) throw new Error("expected non-null value");
  return v;
}

function fn_node(
  id: string,
  parent_id: string | undefined,
  x: number,
  y: number,
  w = 100,
  h = 50,
): CodeFunctionNodeType {
  return {
    id,
    type: "code_function",
    position: { x, y },
    width: w,
    height: h,
    parentId: parent_id,
    data: {
      function_name: id,
      description: "",
      file_path: "",
      line_number: 0,
      is_entry_point: false,
      symbol: id,
    },
  };
}

function module_node(id: string, x: number, y: number, w = 500, h = 300): ModuleGroupNodeType {
  return {
    id,
    type: "module_group",
    position: { x, y },
    width: w,
    height: h,
    style: { width: w, height: h },
    data: {
      module_name: id,
      description: "",
      member_count: 0,
      cluster_index: 0,
    },
  };
}

describe("compute_parent_resize", () => {
  it("returns null when parent does not exist", () => {
    const result = compute_parent_resize("missing", [fn_node("a", undefined, 0, 0)]);
    expect(result).toBeNull();
  });

  it("returns null when parent has no function children", () => {
    const result = compute_parent_resize("m", [module_node("m", 0, 0)]);
    expect(result).toBeNull();
  });

  it("shrinks to the children's bounding box plus padding", () => {
    // Module is 500x300; children sit at the padding lines. Module should
    // shrink to wrap them tightly without shifting anything.
    const nodes: CodeChartNode[] = [
      module_node("m", 100, 200, 500, 300),
      fn_node("a", "m", PAD, PAD_TOP, 100, 50),
      fn_node("b", "m", PAD + 150, PAD_TOP, 100, 50),
    ];
    const r = expect_present(compute_parent_resize("m", nodes));
    // Bounding box of children in parent-local coords: 250 wide x 50 tall
    expect(r.width).toBe(250 + 2 * PAD);
    expect(r.height).toBe(50 + PAD_TOP + PAD);
    expect(r.child_dx).toBe(0);
    expect(r.child_dy).toBe(0);
    // Use Math.abs because -child_dx yields -0 when child_dx is 0.
    expect(Math.abs(r.parent_dx)).toBe(0);
    expect(Math.abs(r.parent_dy)).toBe(0);
  });

  it("does NOT shift when children are past the right/bottom (no teleport on inward drag)", () => {
    // Children are inside the module but with slack on the right (max_x < width).
    // We should shrink, but NOT shift children — otherwise the just-dropped
    // node teleports.
    const nodes: CodeChartNode[] = [
      module_node("m", 0, 0, 500, 300),
      fn_node("a", "m", PAD + 50, PAD_TOP + 20, 100, 50),
    ];
    const r = expect_present(compute_parent_resize("m", nodes));
    expect(r.child_dx).toBe(0);
    expect(r.child_dy).toBe(0);
    expect(Math.abs(r.parent_dx)).toBe(0);
    expect(Math.abs(r.parent_dy)).toBe(0);
    // Width hugs the child at its current (offset) position
    expect(r.width).toBe(PAD + 50 + 100 + PAD);
    expect(r.height).toBe(PAD_TOP + 20 + 50 + PAD);
  });

  it("shifts children + parent when children sit past the top-left padding", () => {
    // Child at negative x (e.g. expandParent grew the parent during a drag)
    const nodes: CodeChartNode[] = [
      module_node("m", 100, 200),
      fn_node("a", "m", -30, -10, 100, 50),
    ];
    const r = expect_present(compute_parent_resize("m", nodes));
    expect(r.child_dx).toBe(PAD - -30);   // 70
    expect(r.child_dy).toBe(PAD_TOP - -10); // 80
    expect(r.parent_dx).toBe(-(PAD - -30));
    expect(r.parent_dy).toBe(-(PAD_TOP - -10));
    // Resulting parent dims wrap the (shifted) bbox
    expect(r.width).toBe(100 + 2 * PAD);
    expect(r.height).toBe(50 + PAD_TOP + PAD);
  });

  it("ignores nodes that belong to a different parent", () => {
    const nodes: CodeChartNode[] = [
      module_node("m", 0, 0),
      module_node("other", 0, 0),
      fn_node("a", "m", PAD, PAD_TOP, 100, 50),
      fn_node("b", "other", 999, 999, 100, 50),
    ];
    const r = expect_present(compute_parent_resize("m", nodes));
    expect(r.width).toBe(100 + 2 * PAD);
    expect(r.height).toBe(50 + PAD_TOP + PAD);
  });

  it("returns null on a no-op (children already tight against padding lines)", () => {
    // Module already sized exactly to wrap the child with padding.
    const expected_w = 100 + 2 * PAD;
    const expected_h = 50 + PAD_TOP + PAD;
    const nodes: CodeChartNode[] = [
      module_node("m", 0, 0, expected_w, expected_h),
      fn_node("a", "m", PAD, PAD_TOP, 100, 50),
    ];
    expect(compute_parent_resize("m", nodes)).toBeNull();
  });

  it("ignores nested non-function children inside the module", () => {
    // A future nested module shouldn't drag the bounding box around.
    const nodes: CodeChartNode[] = [
      module_node("m", 0, 0, 500, 300),
      module_node("nested", 0, 0),
      fn_node("a", "m", PAD, PAD_TOP, 100, 50),
    ];
    const nested = { ...nodes[1], parentId: "m" };
    nodes[1] = nested;
    const r = expect_present(compute_parent_resize("m", nodes));
    // Bbox driven only by the function child
    expect(r.width).toBe(100 + 2 * PAD);
    expect(r.height).toBe(50 + PAD_TOP + PAD);
  });

  it("prefers measured.{width,height} over the design-time estimate", () => {
    // Child's runtime-measured width is larger than its initial estimate.
    const child: CodeFunctionNodeType = {
      ...fn_node("a", "m", PAD, PAD_TOP, 100, 50),
      measured: { width: 200, height: 80 },
    };
    const nodes: CodeChartNode[] = [
      module_node("m", 0, 0, 500, 300),
      child,
    ];
    const r = expect_present(compute_parent_resize("m", nodes));
    // Should size based on measured (200x80), not the stale 100x50
    expect(r.width).toBe(200 + 2 * PAD);
    expect(r.height).toBe(80 + PAD_TOP + PAD);
  });
});

describe("apply_parent_resize", () => {
  it("updates parent dims + position and shifts children inversely", () => {
    const nodes: CodeChartNode[] = [
      module_node("m", 100, 200, 500, 300),
      fn_node("a", "m", -30, -10, 100, 50),
      fn_node("other", undefined, 0, 0),
    ];
    const r = expect_present(compute_parent_resize("m", nodes));
    const updated = apply_parent_resize(nodes, r);

    const parent = expect_present(updated.find(n => n.id === "m"));
    const child = expect_present(updated.find(n => n.id === "a"));
    const top_level = expect_present(updated.find(n => n.id === "other"));

    expect(parent.width).toBe(r.width);
    expect(parent.height).toBe(r.height);
    expect(parent.style?.width).toBe(r.width);
    expect(parent.style?.height).toBe(r.height);
    expect(parent.position).toEqual({ x: 100 + r.parent_dx, y: 200 + r.parent_dy });

    expect(child.position).toEqual({ x: PAD, y: PAD_TOP });

    // Unrelated nodes are untouched
    expect(top_level.position).toEqual({ x: 0, y: 0 });
  });

  it("leaves children alone when no shift is needed", () => {
    const nodes: CodeChartNode[] = [
      module_node("m", 0, 0, 500, 300),
      fn_node("a", "m", PAD + 50, PAD_TOP + 20, 100, 50),
    ];
    const r = expect_present(compute_parent_resize("m", nodes));
    const updated = apply_parent_resize(nodes, r);
    const child = expect_present(updated.find(n => n.id === "a"));
    // Child stays exactly where the user dropped it
    expect(child.position).toEqual({ x: PAD + 50, y: PAD_TOP + 20 });
  });
});
