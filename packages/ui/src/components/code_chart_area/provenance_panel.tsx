import React from "react";

import type { EdgeRow, NodeRow } from "@code-charter/types";

import { navigate_to_file } from "./editor_navigation";

// Driven off the React Flow selection so a node's onClick stays free to jump to source:
// selecting a node reveals its provenance, clicking it still opens the file.
export interface ProvenanceSelection {
  node?: NodeRow;
  edge?: EdgeRow;
}

export const ProvenancePanel: React.FC<ProvenanceSelection> = ({ node, edge }) => {
  if (node === undefined && edge === undefined) {
    return null;
  }

  return (
    <aside aria-label="Provenance" style={{ padding: "8px 12px", fontSize: 12, lineHeight: 1.5 }}>
      {node !== undefined && (
        <div>
          <div>
            <strong>{string_of(node.attributes.label) ?? string_of(node.attributes.description) ?? node.id}</strong>
          </div>
          <dl style={{ margin: 0 }}>
            <Row label="kind" value={node.kind} />
            <Row label="layer" value={node.layer} />
            <Row label="origin" value={node.origin} />
            {node.anchor !== null && <Row label="anchor" value={node.anchor} />}
            {string_of(node.attributes.description) !== undefined && (
              <Row label="description" value={string_of(node.attributes.description)!} />
            )}
          </dl>
          <button type="button" onClick={() => navigate_to_file({ file_path: node.path, line_number: line_of(node) })}>
            Open in editor
          </button>
        </div>
      )}
      {edge !== undefined && (
        <div>
          <dl style={{ margin: 0 }}>
            <Row label="edge" value={edge.kind} />
            <Row label="confidence" value={String(edge.confidence)} />
            <Row label="extractor" value={edge.origin} />
          </dl>
        </div>
      )}
    </aside>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: "flex", gap: 6 }}>
    <dt style={{ opacity: 0.6 }}>{label}</dt>
    <dd style={{ margin: 0 }}>{value}</dd>
  </div>
);

function string_of(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function line_of(node: NodeRow): number {
  return typeof node.attributes.line_number === "number" ? node.attributes.line_number : 1;
}
