import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
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
    on_store_changed: over.on_store_changed ?? (() => () => undefined),
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
    refresh_nonce,
  }: {
    selected_flow_id: string | null;
    indexing_status: CodeIndexStatus;
    refresh_nonce?: number;
  }) => (
    <div
      data-testid="chart"
      data-selected={selected_flow_id ?? ""}
      data-status={indexing_status}
      data-refresh={refresh_nonce ?? 0}
    />
  ),
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

  it("reloads flows and bumps the chart refresh nonce on a store_changed push", async () => {
    let store_listener: (() => void) | undefined;
    const list_flows = jest
      .fn<Promise<FlowSummary[]>, []>()
      .mockResolvedValueOnce([flow("a")])
      .mockResolvedValue([flow("a"), flow("b")]);
    mock_backend.current = make_backend({
      list_flows,
      on_store_changed: (listener) => {
        store_listener = listener;
        return () => undefined;
      },
    });
    render_app();

    await waitFor(() => expect(screen.getByTestId("sidebar").textContent).toContain("a"));
    expect(list_flows).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("chart").getAttribute("data-refresh")).toBe("0");

    act(() => store_listener?.());

    await waitFor(() => expect(screen.getByTestId("sidebar").textContent).toContain("b"));
    expect(list_flows).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("chart").getAttribute("data-refresh")).toBe("1");
  });

  it("bumps the refresh nonce but selects nothing when store_changed arrives with an empty flow list", async () => {
    let store_listener: (() => void) | undefined;
    mock_backend.current = make_backend({
      list_flows: async () => [],
      on_store_changed: (listener) => {
        store_listener = listener;
        return () => undefined;
      },
    });
    render_app();

    await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-status")).toBe(CodeIndexStatus.Ready));
    expect(screen.getByTestId("chart").getAttribute("data-selected")).toBe("");

    act(() => store_listener?.());

    await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-refresh")).toBe("1"));
    expect(screen.getByTestId("chart").getAttribute("data-selected")).toBe("");
    expect(screen.getByTestId("chart").getAttribute("data-status")).toBe(CodeIndexStatus.Ready);
  });

  it("recovers from Error to Ready on a store_changed refresh once the call graph is available", async () => {
    let store_listener: (() => void) | undefined;
    const empty_graph: CallGraph = { nodes: new Map(), entry_points: [] };
    const get_call_graph = jest
      .fn<Promise<CallGraph | undefined>, []>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(empty_graph);
    mock_backend.current = make_backend({
      get_call_graph,
      list_flows: async () => [flow("a")],
      on_store_changed: (listener) => {
        store_listener = listener;
        return () => undefined;
      },
    });
    render_app();
    await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-status")).toBe(CodeIndexStatus.Error));

    act(() => store_listener?.());

    await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-status")).toBe(CodeIndexStatus.Ready));
  });

  it("keeps the mounted surface (no Error flip) when a store_changed refresh hits a transient null graph", async () => {
    let store_listener: (() => void) | undefined;
    const empty_graph: CallGraph = { nodes: new Map(), entry_points: [] };
    const get_call_graph = jest
      .fn<Promise<CallGraph | undefined>, []>()
      .mockResolvedValueOnce(empty_graph)
      .mockResolvedValue(undefined);
    mock_backend.current = make_backend({
      get_call_graph,
      list_flows: async () => [flow("a")],
      on_store_changed: (listener) => {
        store_listener = listener;
        return () => undefined;
      },
    });
    render_app();
    await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-status")).toBe(CodeIndexStatus.Ready));

    act(() => store_listener?.());

    await act(async () => undefined);
    expect(screen.getByTestId("chart").getAttribute("data-status")).toBe(CodeIndexStatus.Ready);
  });

  it("subscribes to store_changed once and unsubscribes when it unmounts", async () => {
    const unsubscribe = jest.fn();
    const on_store_changed = jest.fn(() => unsubscribe);
    mock_backend.current = make_backend({
      list_flows: async () => [flow("a")],
      on_store_changed,
    });
    const { unmount } = render_app();

    await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-status")).toBe(CodeIndexStatus.Ready));
    expect(on_store_changed).toHaveBeenCalledTimes(1);
    expect(unsubscribe).not.toHaveBeenCalled();

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
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
