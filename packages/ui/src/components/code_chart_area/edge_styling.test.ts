import type { EdgeRow } from "@code-charter/types";

import { edge_style_for, edge_style_for_row } from "./edge_styling";
import { get_theme_colors } from "./theme_config";
import { light_theme } from "../../theme/default_themes";

const colors = get_theme_colors(light_theme);

function edge(over: Partial<EdgeRow> = {}): EdgeRow {
  return {
    key: "e1",
    src_id: "a",
    dst_id: "b",
    kind: "code.calls",
    confidence: 1,
    layer: "raw",
    attributes: {},
    field_ownership: {},
    origin: "ariadne",
    intent_source: "code-edit",
    adjudication: null,
    deleted_at: null,
    ...over,
  };
}

describe("edge_style_for", () => {
  it("renders a low-confidence (inferred/agentic) edge dashed", () => {
    expect(edge_style_for({ confidence: 0.5 }, colors).strokeDasharray).toBeDefined();
  });

  it("renders a full-confidence (raw) edge solid", () => {
    expect(edge_style_for({ confidence: 1 }, colors).strokeDasharray).toBeUndefined();
  });

  it("renders an edge with unknown confidence solid", () => {
    expect(edge_style_for({}, colors).strokeDasharray).toBeUndefined();
  });

  it("uses the selected stroke and a thicker width when selected", () => {
    const selected = edge_style_for({ selected: true }, colors);
    const unselected = edge_style_for({ selected: false }, colors);
    expect(selected.stroke).toBe(colors.edge.strokeSelected);
    expect(unselected.stroke).toBe(colors.edge.stroke);
    expect(selected.strokeWidth).not.toBe(unselected.strokeWidth);
  });

  it("reads the open attribute set off an EdgeRow through the same path", () => {
    const dashed = edge_style_for_row(edge({ confidence: 0.2, kind: "agentic.inferred" }), colors);
    expect(dashed.strokeDasharray).toBeDefined();
    const solid = edge_style_for_row(edge({ confidence: 1, kind: "code.calls" }), colors);
    expect(solid.strokeDasharray).toBeUndefined();
  });

  it("flows the selected flag through the row adapter", () => {
    const selected = edge_style_for_row(edge(), colors, true);
    expect(selected.stroke).toBe(colors.edge.strokeSelected);
    expect(selected.strokeWidth).toBe(3);
    const unselected = edge_style_for_row(edge(), colors);
    expect(unselected.stroke).toBe(colors.edge.stroke);
    expect(unselected.strokeWidth).toBe(2);
  });
});
