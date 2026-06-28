import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import type { CallGraph } from "@ariadnejs/types";
import type { CodeCharterBackend, FlowSummary } from "@code-charter/types";

import { App } from "./app";
import { CodeIndexStatus } from "./loading_status";
import { ThemeProviderComponent } from "../theme";

function render_app() {
  return render(
    <ThemeProviderComponent force_standalone>
      <App />
    </ThemeProviderComponent>
  );
}

function make_backend(over: Partial<CodeCharterBackend>): CodeCharterBackend {
  const empty_graph: CallGraph = { nodes: new Map(), entry_points: [] };
  return {
    get_call_graph: over.get_call_graph ?? (async () => empty_graph),
    list_flows: over.list_flows ?? (async () => []),
    render_flow: over.render_flow ?? (async () => ({ nodes: [], edges: [] })),
    navigate_to_doc: over.navigate_to_doc ?? (async () => undefined),
  };
}

const mock_backend: { current: CodeCharterBackend } = { current: make_backend({}) };

jest.mock("../hooks/use_backend", () => ({
  use_backend: () => ({ backend: mock_backend.current }),
}));

jest.mock("./side_bar", () => ({
  __esModule: true,
  default: ({ flows, selected_flow_id }: { flows: FlowSummary[]; selected_flow_id: string | null }) => (
    <div data-testid="sidebar" data-selected={selected_flow_id ?? ""}>
      {flows.map((flow) => (
        <span key={flow.id}>{flow.id}</span>
      ))}
    </div>
  ),
}));

jest.mock("./code_chart_area/code_chart_area", () => ({
  CodeChartAreaReactFlowWrapper: ({
    selected_flow_id,
    indexing_status,
  }: {
    selected_flow_id: string | null;
    indexing_status: CodeIndexStatus;
  }) => <div data-testid="chart" data-selected={selected_flow_id ?? ""} data-status={indexing_status} />,
}));

function flow(id: string): FlowSummary {
  return {
    id,
    label: id,
    is_hydrated: false,
    last_synced_at: null,
    member_count: 1,
    is_unattributed: false,
    seed_location: { file_path: `${id}.ts`, line_number: 1 },
  };
}

beforeEach(() => {
  mock_backend.current = make_backend({});
});

describe("App", () => {
  it("reports indexing status until flows load, then ready", async () => {
    mock_backend.current = make_backend({ list_flows: async () => [flow("a")] });
    render_app();
    expect(screen.getByTestId("chart").getAttribute("data-status")).toBe(CodeIndexStatus.Indexing);
    await waitFor(() =>
      expect(screen.getByTestId("chart").getAttribute("data-status")).toBe(CodeIndexStatus.Ready)
    );
  });

  it("auto-selects the top flow once flows load", async () => {
    mock_backend.current = make_backend({ list_flows: async () => [flow("top"), flow("next")] });
    render_app();
    await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-selected")).toBe("top"));
  });

  it("selects nothing when there are no flows", async () => {
    mock_backend.current = make_backend({ list_flows: async () => [] });
    render_app();
    await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-status")).toBe(CodeIndexStatus.Ready));
    expect(screen.getByTestId("chart").getAttribute("data-selected")).toBe("");
  });

  it("reports an error and skips the flow list when the call graph is unavailable", async () => {
    const list_flows = jest.fn(async () => [flow("a")]);
    mock_backend.current = make_backend({ get_call_graph: async () => undefined, list_flows });
    render_app();
    await waitFor(() =>
      expect(screen.getByTestId("chart").getAttribute("data-status")).toBe(CodeIndexStatus.Error)
    );
    expect(list_flows).not.toHaveBeenCalled();
  });
});
