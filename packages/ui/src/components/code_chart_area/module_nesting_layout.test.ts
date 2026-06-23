/**
 * Regression for task-29.3: dragging a module must move its child function nodes, and modules must not
 * collapse onto each other. The live defect was a stale persisted layout (every module at {0,0},
 * `style: undefined`) restored on load and bypassing the layout pipeline — so every child resolved to the
 * same absolute position (overlap) and no child was nested under a draggable parent.
 *
 * Auto-restore is gone; the layout is always computed fresh. This test exercises the real pipeline
 * (`custom_graph_to_react_flow` → real ELK `apply_hierarchical_layout`, no mock) and pins the invariants
 * the defect violated: every module gets a distinct position with concrete `style` dimensions, and every
 * child is nested under its module with a parent-relative position. With those, React Flow derives each
 * child's absolute position from its parent each render, so the child follows the module on drag.
 */

import type { EdgeRow, NodeRow } from "@code-charter/types";

import { custom_graph_to_react_flow } from "./custom_graph_to_react_flow";
import { apply_hierarchical_layout, clear_layout_caches } from "./graph_layout";
import { is_module_node } from "./chart_types";

function fn_row(id: string, path: string): NodeRow {
  return {
    id,
    kind: "code.function",
    path,
    anchor: `${id}:` + "a".repeat(64),
    layer: "raw",
    attributes: { description: "does a thing" },
    field_ownership: {},
    origin: "ariadne",
    intent_source: "code-edit",
    deleted_at: null,
  };
}

function module_row(path: string): NodeRow {
  return {
    id: `agentic.group:file:${path}`,
    kind: "agentic.group",
    path,
    anchor: null,
    layer: "agentic",
    attributes: { label: path },
    field_ownership: {},
    origin: "ariadne",
    intent_source: "code-edit",
    deleted_at: null,
  };
}

function contains(child_id: string, module_id: string): EdgeRow {
  return {
    key: `contains:${child_id}`,
    src_id: child_id,
    dst_id: module_id,
    kind: "agentic.contains",
    confidence: 1,
    layer: "agentic",
    attributes: {},
    field_ownership: {},
    origin: "ariadne",
    intent_source: "code-edit",
    adjudication: null,
    deleted_at: null,
  };
}

describe("module nesting layout (task-29.3 regression)", () => {
  beforeEach(() => clear_layout_caches());

  it("lays out multiple modules at distinct positions with children nested parent-relative", async () => {
    // Three single-function file-modules — the shape the live bergamot flow had.
    const specs = [
      { path: "src/a.ts", fn: "src/a.ts#alpha:function" },
      { path: "src/b.ts", fn: "src/b.ts#beta:function" },
      { path: "src/c.ts", fn: "src/c.ts#gamma:function" },
    ];
    const rows = {
      nodes: [
        ...specs.map((s) => fn_row(s.fn, s.path)),
        ...specs.map((s) => module_row(s.path)),
      ],
      edges: specs.map((s) => contains(s.fn, `agentic.group:file:${s.path}`)),
    };

    const { nodes, edges } = custom_graph_to_react_flow(rows);
    const laid = await apply_hierarchical_layout(nodes, edges);

    const modules = laid.filter(is_module_node);
    expect(modules).toHaveLength(3);

    // Every module carries concrete dimensions (the broken snapshot had `style: undefined`).
    for (const mod of modules) {
      expect(typeof mod.style?.width).toBe("number");
      expect(typeof mod.style?.height).toBe("number");
    }

    // Modules do not overlap. The defect collapsed every module onto {0,0}; a real layout separates
    // their bounding boxes. Distinct positions alone is too weak (two boxes can be distinct yet overlap),
    // so assert no pair of module rectangles intersects.
    const rect_of = (m: (typeof modules)[number]) => ({
      x1: m.position.x,
      y1: m.position.y,
      x2: m.position.x + Number(m.style?.width),
      y2: m.position.y + Number(m.style?.height),
    });
    for (let i = 0; i < modules.length; i++) {
      for (let j = i + 1; j < modules.length; j++) {
        const a = rect_of(modules[i]);
        const b = rect_of(modules[j]);
        const overlaps = a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
        expect(overlaps).toBe(false);
      }
    }

    // Each child is nested under its module (parentId set), and children of different modules carry the
    // SAME parent-relative position — so on screen the only thing separating them is their parent's
    // offset. That is exactly what makes a child follow its module on drag: React Flow re-derives the
    // child's absolute position from the (moving) parent each render. If positions were absolute instead
    // of relative, the children would NOT share a relative coordinate.
    const child_relatives = specs.map((s) => {
      const module_id = `agentic.group:file:${s.path}`;
      const child = laid.find((n) => n.id === s.fn)!;
      expect(child.parentId).toBe(module_id);
      return child.position;
    });
    const first = child_relatives[0];
    for (const rel of child_relatives) {
      expect(rel).toEqual(first);
    }
    // ...while the parents those identical relatives resolve against are at different absolute positions.
    const module_positions = new Set(modules.map((m) => `${m.position.x},${m.position.y}`));
    expect(module_positions.size).toBe(modules.length);
  });
});
