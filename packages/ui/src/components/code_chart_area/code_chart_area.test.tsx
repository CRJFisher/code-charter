import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { CodeIndexStatus } from "../loading_status";
import { ThemeProviderComponent } from "../../theme/theme_context";

// The render/clear effects are the unit under test; the visual machinery (ReactFlow, ELK layout,
// virtualization) is mocked away so a refresh_nonce bump can be observed as a re-projection.
const clear_layout_caches = jest.fn();
jest.mock("./graph_layout", () => ({
  apply_hierarchical_layout: jest.fn(async () => []),
  clear_layout_caches: () => clear_layout_caches(),
}));

jest.mock("@xyflow/react", () => ({
  ReactFlow: () => <div data-testid="react-flow" />,
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Controls: () => null,
  Background: () => null,
  MiniMap: () => null,
  BackgroundVariant: { Dots: "dots" },
  useNodesState: () => [[], jest.fn(), jest.fn()],
  useEdgesState: () => [[], jest.fn(), jest.fn()],
  useStore: (selector: (state: { transform: [number, number, number] }) => unknown) =>
    selector({ transform: [0, 0, 1] }),
}));

jest.mock("./virtual_renderer", () => ({
  use_virtual_nodes: () => ({ virtual_nodes: [], virtual_edges: [], hidden_node_count: 0 }),
  get_visible_nodes: () => [],
  ViewportIndicator: () => null,
}));

jest.mock("./chart_node_types", () => ({ build_node_types: () => ({}) }));
jest.mock("./keyboard_navigation", () => ({
  use_keyboard_navigation: () => undefined,
  SkipToGraph: () => null,
}));
jest.mock("./parent_resize", () => ({
  compute_parent_resize: () => null,
  apply_parent_resize: (nodes: unknown) => nodes,
}));
jest.mock("./state_persistence", () => ({ export_graph_state: () => undefined }));
jest.mock("./provenance_panel", () => ({ ProvenancePanel: () => null }));

import { CodeChartAreaReactFlow } from "./code_chart_area";

function render_chart(props: { selected_flow_id: string | null; render_flow: jest.Mock; refresh_nonce: number }) {
  return render(
    <ThemeProviderComponent force_standalone>
      <CodeChartAreaReactFlow
        selected_flow_id={props.selected_flow_id}
        render_flow={props.render_flow}
        indexing_status={CodeIndexStatus.Ready}
        refresh_nonce={props.refresh_nonce}
      />
    </ThemeProviderComponent>
  );
}

describe("CodeChartArea refresh_nonce", () => {
  beforeEach(() => clear_layout_caches.mockClear());

  it("re-runs render_flow for the same flow when refresh_nonce changes", async () => {
    const render_flow = jest.fn(async () => ({ nodes: [], edges: [] }));
    const { rerender } = render_chart({ selected_flow_id: "flow-1", render_flow, refresh_nonce: 0 });

    await waitFor(() => expect(render_flow).toHaveBeenCalledTimes(1));
    const clears_after_mount = clear_layout_caches.mock.calls.length;

    rerender(
      <ThemeProviderComponent force_standalone>
        <CodeChartAreaReactFlow
          selected_flow_id="flow-1"
          render_flow={render_flow}
          indexing_status={CodeIndexStatus.Ready}
          refresh_nonce={1}
        />
      </ThemeProviderComponent>
    );

    // The nonce bump — with the flow id unchanged — both re-projects the flow and clears the layout
    // cache, so a description-only reconcile repaints.
    await waitFor(() => expect(render_flow).toHaveBeenCalledTimes(2));
    expect(clear_layout_caches.mock.calls.length).toBeGreaterThan(clears_after_mount);
  });

  it("does not re-run render_flow on a nonce bump when no flow is selected", async () => {
    const render_flow = jest.fn(async () => ({ nodes: [], edges: [] }));
    const { rerender } = render_chart({ selected_flow_id: null, render_flow, refresh_nonce: 0 });

    rerender(
      <ThemeProviderComponent force_standalone>
        <CodeChartAreaReactFlow
          selected_flow_id={null}
          render_flow={render_flow}
          indexing_status={CodeIndexStatus.Ready}
          refresh_nonce={1}
        />
      </ThemeProviderComponent>
    );

    // Flush the effects' async bodies so a spurious render_flow call would have a tick to fire; a bare
    // not.toHaveBeenCalled() is satisfied on the first synchronous poll and would miss it.
    await act(async () => undefined);
    expect(render_flow).not.toHaveBeenCalled();
  });
});
