import type { CodeChartNode } from "./chart_types";
import { CONFIG } from "./chart_config";

export interface ParentResize {
  parent_id: string;
  width: number;
  height: number;
  parent_dx: number;
  parent_dy: number;
  child_dx: number;
  child_dy: number;
}

/**
 * Compute the tight bounding box of a module's children (in parent-local coords)
 * and the deltas needed to make the children sit flush against the module's
 * padding lines. Children's positions in React Flow are relative to their parent.
 *
 * `expandParent: true` grows the parent during a drag but never shrinks it; this
 * is the inverse — it removes slack on the right/bottom and, only when children
 * have crossed the top/left padding lines, shifts the parent + children
 * symmetrically so children stay visually stationary.
 *
 * Pass the FULL node array (not the virtualised subset) — off-screen siblings
 * must be included in the bounding box.
 */
export function compute_parent_resize(
  parent_id: string,
  nodes: ReadonlyArray<CodeChartNode>,
): ParentResize | null {
  const parent = nodes.find(n => n.id === parent_id);
  if (!parent) return null;

  // Only consider concrete function children. If modules ever nest, nested
  // module nodes shouldn't drive the bounding box.
  const children = nodes.filter(
    n => n.parentId === parent_id && n.type === "code_function",
  );
  if (children.length === 0) return null;

  let min_x = Infinity;
  let min_y = Infinity;
  let max_x = -Infinity;
  let max_y = -Infinity;
  for (const c of children) {
    // Prefer the React-Flow-measured size (matches what `expandParent` sees
    // during a drag). Fall back to the design-time estimate.
    const w = c.measured?.width ?? c.width ?? 0;
    const h = c.measured?.height ?? c.height ?? 0;
    min_x = Math.min(min_x, c.position.x);
    min_y = Math.min(min_y, c.position.y);
    max_x = Math.max(max_x, c.position.x + w);
    max_y = Math.max(max_y, c.position.y + h);
  }

  const pad_side = CONFIG.layout.module.innerPadding;
  const pad_top = pad_side + CONFIG.layout.module.headerHeight;

  // Always shift so the bounding box's top-left sits at (pad_side, pad_top),
  // and shift the parent inversely so children stay visually stationary.
  // For child at local cA with parent at absolute X:
  //   new_absolute = (X + parent_dx) + (cA + child_dx)
  //                = (X - D)         + (cA + D)            = X + cA
  // So shifting unconditionally preserves every child's absolute position;
  // only the parent's border moves. This is required to tighten the left/top
  // when children are dragged inward (creating slack on those sides) — the
  // right/bottom shrink automatically via max_x/max_y, but the left/top need
  // an explicit shift.
  const child_dx = pad_side - min_x;
  const child_dy = pad_top - min_y;

  // After the shift, the bounding box's left/top sits at (pad_side, pad_top)
  // and its right/bottom at (max_x + child_dx, max_y + child_dy). Wrap with
  // pad_side on the right/bottom.
  const new_width = (max_x + child_dx) + pad_side;
  const new_height = (max_y + child_dy) + pad_side;

  // Return null when nothing changed so the caller can skip the state update
  // entirely, avoiding a redundant React Flow re-render on every drag-stop.
  const current_width = parent.width ?? parent.measured?.width;
  const current_height = parent.height ?? parent.measured?.height;
  if (
    child_dx === 0 &&
    child_dy === 0 &&
    current_width === new_width &&
    current_height === new_height
  ) {
    return null;
  }

  return {
    parent_id,
    width: new_width,
    height: new_height,
    parent_dx: -child_dx,
    parent_dy: -child_dy,
    child_dx,
    child_dy,
  };
}

/**
 * Apply a resize to the node array: update the parent's position + dimensions
 * and shift all of its function-node children by the inverse so they don't
 * visually move.
 */
export function apply_parent_resize(
  nodes: ReadonlyArray<CodeChartNode>,
  r: ParentResize,
): CodeChartNode[] {
  const shift_children = r.child_dx !== 0 || r.child_dy !== 0;
  return nodes.map(n => {
    if (n.id === r.parent_id) {
      return {
        ...n,
        position: {
          x: n.position.x + r.parent_dx,
          y: n.position.y + r.parent_dy,
        },
        width: r.width,
        height: r.height,
        style: { ...n.style, width: r.width, height: r.height },
      };
    }
    if (shift_children && n.parentId === r.parent_id && n.type === "code_function") {
      return {
        ...n,
        position: {
          x: n.position.x + r.child_dx,
          y: n.position.y + r.child_dy,
        },
      };
    }
    return n;
  });
}
