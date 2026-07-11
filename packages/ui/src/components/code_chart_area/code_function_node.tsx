import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { navigate_to_file } from "./editor_navigation";
import { use_flow_theme_styles } from "./use_chart_theme_styles";
import { CONFIG } from "./chart_config";
import type { NodeRow } from "@code-charter/types";
import type { CodeFunctionNodeType } from "./chart_types";

export interface CodeNodeData extends Record<string, unknown> {
  function_name: string;
  description: string;
  file_path: string;
  line_number: number;
  is_entry_point?: boolean;
  symbol: string;
  /** The source row, attached by `custom_graph_to_react_flow` for selection-driven provenance. */
  row?: NodeRow;
}

const CodeFunctionNodeComponent: React.FC<NodeProps<CodeFunctionNodeType>> = (props) => {
  const data = props.data;
  const { selected } = props;
  const theme_styles = use_flow_theme_styles();

  const handle_click = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate_to_file({
      file_path: data.file_path,
      line_number: data.line_number,
    });
  };

  const handle_key_down = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      navigate_to_file({
        file_path: data.file_path,
        line_number: data.line_number,
      });
    }
  };

  const node_styles: React.CSSProperties = {
    padding: "10px",
    borderRadius: "5px",
    backgroundColor: data.is_entry_point
      ? theme_styles.colors.node.background.entry_point
      : theme_styles.colors.node.background.default,
    border: `${selected ? CONFIG.node.visual.borderWidth.selected : CONFIG.node.visual.borderWidth.default}px solid ${
      selected ? theme_styles.colors.node.border.selected : theme_styles.colors.node.border.default
    }`,
    minWidth: "200px",
    maxWidth: "350px",
    cursor: "pointer",
    transition: "all 0.2s ease",
    outline: "none",
    position: "relative",
  };

  const header_styles: React.CSSProperties = {
    fontWeight: "bold",
    fontSize: "14px",
    marginBottom: "8px",
    color: data.is_entry_point
      ? theme_styles.colors.node.text.entry_point
      : theme_styles.colors.node.text.default,
    display: "flex",
    alignItems: "center",
    gap: "4px",
  };

  const description_styles: React.CSSProperties = {
    fontSize: "12px",
    color: theme_styles.colors.node.text.secondary,
    lineHeight: "1.4",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  const handle_color = theme_styles.colors.edge.stroke;

  const aria_label = `${data.is_entry_point ? 'Entry point function' : 'Function'}: ${data.function_name}. ${data.description || 'No description available'}. Located at ${data.file_path} line ${data.line_number}. Press Enter to navigate to source code.`;

  return (
    <div
      style={node_styles}
      onClick={handle_click}
      onKeyDown={handle_key_down}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.02)";
        e.currentTarget.style.boxShadow = theme_styles.colors.shadow.hover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = "none";
      }}
      role="button"
      tabIndex={0}
      aria-label={aria_label}
      aria-selected={selected}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: handle_color }}
      />

      <div style={header_styles}>
        {data.is_entry_point && <span aria-label="Entry point">⮕</span>}
        <span>{data.function_name}</span>
      </div>

      {data.description && (
        <div style={description_styles}>
          {data.description}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: handle_color }}
      />
    </div>
  );
};

export const CodeFunctionNode = React.memo(CodeFunctionNodeComponent, (prev_props, next_props) => {
  return (
    prev_props.data.function_name === next_props.data.function_name &&
    prev_props.data.description === next_props.data.description &&
    prev_props.data.file_path === next_props.data.file_path &&
    prev_props.data.line_number === next_props.data.line_number &&
    prev_props.data.is_entry_point === next_props.data.is_entry_point &&
    prev_props.selected === next_props.selected &&
    prev_props.id === next_props.id
  );
});
