import React from "react";
import { render, screen } from "@testing-library/react";

import type { EdgeRow, NodeRow } from "@code-charter/types";

import { ProvenancePanel } from "./provenance_panel";

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

describe("ProvenancePanel (AC#8)", () => {
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
  });
});
