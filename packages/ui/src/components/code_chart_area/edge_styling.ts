import type { CSSProperties } from "react";

import type { EdgeRow } from "@code-charter/types";

import type { ThemeColorConfig } from "./theme_config";

/**
 * `edge_style_for` maps an open attribute set (confidence + extractor + kind + label/role) to a
 * React Flow edge style. A new visual distinction (a semantic edge label, a cross-modal tint) adds a
 * branch here rather than a per-edge-class fork at the call sites. The extra inputs are accepted even
 * when unread so plumbing them through later is not a signature change.
 */

/** Below this confidence an edge renders dashed, distinguishing inferred/agentic edges from raw ones. */
export const CONFIDENCE_DASHED_THRESHOLD = 1;

export interface EdgeStyleInputs {
  confidence?: number;
  extractor?: string;
  kind?: string;
  role?: string;
  selected?: boolean;
}

export function edge_style_for(inputs: EdgeStyleInputs, colors: ThemeColorConfig): CSSProperties {
  const style: CSSProperties = {
    stroke: inputs.selected ? colors.edge.strokeSelected : colors.edge.stroke,
    strokeWidth: inputs.selected ? 3 : 2,
  };
  if (inputs.confidence !== undefined && inputs.confidence < CONFIDENCE_DASHED_THRESHOLD) {
    style.strokeDasharray = "6 4";
  }
  return style;
}

/** Style an `EdgeRow` through {@link edge_style_for}, reading the open attribute set off the row. */
export function edge_style_for_row(edge: EdgeRow, colors: ThemeColorConfig, selected = false): CSSProperties {
  const label = edge.attributes.label;
  const explicit_role = edge.attributes.role;
  const role = typeof label === "string" ? label : typeof explicit_role === "string" ? explicit_role : undefined;
  return edge_style_for(
    { confidence: edge.confidence, extractor: edge.origin, kind: edge.kind, role, selected },
    colors,
  );
}
