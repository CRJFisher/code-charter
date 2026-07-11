import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import type { EdgeRow, NodeRow } from "@code-charter/types";

import { ProvenancePanel } from "./provenance_panel";
import { navigate_to_file } from "./editor_navigation";

jest.mock("./editor_navigation", () => ({
  navigate_to_file: jest.fn(),
}));

const mocked_navigate = jest.mocked(navigate_to_file);

function node(over: Partial<NodeRow> = {}): NodeRow {
  return {
    id: "src/app.ts#calculate:function",
    kind: "code.function",
    path: "src/app.ts",
    anchor: null,
    layer: "user",
    attributes: { label: "calculate", description: "adds two numbers" },
    field_ownership: {},
    origin: "ariadne",
    intent_source: "code-edit",
    deleted_at: null,
    ...over,
  };
}

describe("ProvenancePanel", () => {
  beforeEach(() => {
    mocked_navigate.mockClear();
  });

  it("renders nothing when there is no selection", () => {
    const { container } = render(<ProvenancePanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the selected node's provenance and a secondary navigate action", () => {
    render(<ProvenancePanel node={node()} />);
    expect(screen.getByText("code.function")).toBeInTheDocument();
    expect(screen.getByText("user")).toBeInTheDocument();
    expect(screen.getByText("adds two numbers")).toBeInTheDocument();
    // navigation stays available as a secondary action, not the provenance trigger
    expect(screen.getByRole("button", { name: /open in editor/i })).toBeInTheDocument();
  });

  it("renders edge provenance (confidence + extractor) for a selected edge", () => {
    const edge: EdgeRow = {
      key: "e1",
      src_id: "a",
      dst_id: "b",
      kind: "code.calls",
      confidence: 0.5,
      layer: "raw",
      attributes: {},
      field_ownership: {},
      origin: "ariadne",
      intent_source: "code-edit",
      adjudication: null,
      deleted_at: null,
    };
    render(<ProvenancePanel edge={edge} />);
    expect(screen.getByText("code.calls")).toBeInTheDocument();
    expect(screen.getByText("0.5")).toBeInTheDocument();
    expect(screen.getByText("ariadne")).toBeInTheDocument();
  });

  it("falls back to the node id as the heading when label and description are absent", () => {
    render(<ProvenancePanel node={node({ attributes: {} })} />);
    expect(screen.getByText("src/app.ts#calculate:function")).toBeInTheDocument();
    expect(screen.queryByText("description")).not.toBeInTheDocument();
  });

  it("prefers the label over the description for the heading", () => {
    render(<ProvenancePanel node={node({ attributes: { label: "calc", description: "details" } })} />);
    expect(screen.getByText("calc")).toBeInTheDocument();
  });

  it("renders the anchor row only when the node is anchored", () => {
    const { rerender } = render(<ProvenancePanel node={node({ anchor: null })} />);
    expect(screen.queryByText("anchor")).not.toBeInTheDocument();
    rerender(<ProvenancePanel node={node({ anchor: "calculate:abc123" })} />);
    expect(screen.getByText("calculate:abc123")).toBeInTheDocument();
  });

  it("navigates to the node's path and line_number attribute when Open in editor is clicked", () => {
    render(<ProvenancePanel node={node({ path: "src/lib.ts", attributes: { line_number: 42 } })} />);
    fireEvent.click(screen.getByRole("button", { name: /open in editor/i }));
    expect(mocked_navigate).toHaveBeenCalledWith({ file_path: "src/lib.ts", line_number: 42 });
  });

  it("defaults navigation to line 1 when the node has no line_number attribute", () => {
    render(<ProvenancePanel node={node({ path: "src/lib.ts", attributes: {} })} />);
    fireEvent.click(screen.getByRole("button", { name: /open in editor/i }));
    expect(mocked_navigate).toHaveBeenCalledWith({ file_path: "src/lib.ts", line_number: 1 });
  });
});
