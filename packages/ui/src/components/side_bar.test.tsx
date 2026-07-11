import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import type { FlowSummary } from "@code-charter/types";

import Sidebar from "./side_bar";

const navigate_to_doc = jest.fn();
jest.mock("../hooks/use_backend", () => ({
  use_backend: () => ({ backend: { navigate_to_doc } }),
}));

function flow(over: Partial<FlowSummary> & { id: string }): FlowSummary {
  return {
    id: over.id,
    label: over.label ?? over.id,
    is_hydrated: over.is_hydrated ?? false,
    last_synced_at: over.last_synced_at ?? null,
    member_count: over.member_count ?? 1,
    is_unattributed: over.is_unattributed ?? false,
    seed_location: "seed_location" in over ? over.seed_location! : { file_path: `${over.id}.ts`, line_number: 3 },
  };
}

beforeEach(() => navigate_to_doc.mockClear());

describe("Sidebar flow selector", () => {
  it("renders flows in the order given (no re-sort)", () => {
    const flows = [flow({ id: "first", label: "first" }), flow({ id: "second", label: "second" })];
    render(<Sidebar flows={flows} selected_flow_id={null} on_select={() => undefined} />);
    const items = screen.getAllByText(/first|second/).map((el) => el.textContent);
    expect(items).toEqual(["first", "second"]);
  });

  it("caps the list and reveals the rest via the 'more' affordance", () => {
    const flows = Array.from({ length: 15 }, (_, i) => flow({ id: `f${i}`, label: `f${i}` }));
    render(<Sidebar flows={flows} selected_flow_id={null} on_select={() => undefined} />);
    expect(screen.queryByText("f12")).toBeNull();
    fireEvent.click(screen.getByText("Show 3 more"));
    expect(screen.getByText("f14")).toBeInTheDocument();
  });

  it("calls on_select and navigates to the seed location on click", () => {
    const on_select = jest.fn();
    const flows = [flow({ id: "main", label: "main", seed_location: { file_path: "src/main.ts", line_number: 7 } })];
    render(<Sidebar flows={flows} selected_flow_id={null} on_select={on_select} />);
    fireEvent.click(screen.getByText("main"));
    expect(on_select).toHaveBeenCalledWith("main");
    expect(navigate_to_doc).toHaveBeenCalledWith("src/main.ts", 7);
  });

  it("labels the unattributed bucket distinctly and does not navigate (no seed)", () => {
    const on_select = jest.fn();
    const flows = [flow({ id: "agentic.flow:unattributed", label: "Unattributed", is_unattributed: true, seed_location: null })];
    render(<Sidebar flows={flows} selected_flow_id={null} on_select={on_select} />);
    expect(screen.getByText("unattributed code")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Unattributed"));
    expect(on_select).toHaveBeenCalledWith("agentic.flow:unattributed");
    expect(navigate_to_doc).not.toHaveBeenCalled();
  });

  it("renders the member count for an attributed flow", () => {
    const flows = [flow({ id: "main", label: "main", member_count: 5 })];
    render(<Sidebar flows={flows} selected_flow_id={null} on_select={() => undefined} />);
    expect(screen.getByText("5 functions")).toBeInTheDocument();
  });

  it("marks a hydrated flow with the agentic-diagram badge", () => {
    const flows = [flow({ id: "hot", label: "hot", is_hydrated: true }), flow({ id: "cold", label: "cold", is_hydrated: false })];
    render(<Sidebar flows={flows} selected_flow_id={null} on_select={() => undefined} />);
    expect(screen.getAllByTitle("This flow has an agentic diagram")).toHaveLength(1);
  });

  it("toggles the sidebar open and collapsed", () => {
    const flows = [flow({ id: "main", label: "main" })];
    render(<Sidebar flows={flows} selected_flow_id={null} on_select={() => undefined} />);
    expect(screen.getByText("◀")).toBeInTheDocument();
    fireEvent.click(screen.getByText("◀"));
    expect(screen.queryByText("◀")).toBeNull();
    expect(screen.getByText("☰")).toBeInTheDocument();
  });
});
