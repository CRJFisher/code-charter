import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { navigateToFile } from "./editor_navigation";
import { useFlowThemeStyles } from "./use_chart_theme_styles";

export interface CodeNodeData extends Record<string, unknown> {
  function_name: string;
  description: string;
  file_path: string;
  line_number: number;
  is_entry_point?: boolean;
  symbol: string;
}

const CodeFunctionNodeComponent: React.FC<NodeProps> = (props) => {
  const data = props.data as CodeNodeData;
  const { selected } = props;
  const themeStyles = useFlowThemeStyles();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigateToFile({
      file_path: data.file_path,
      line_number: data.line_number,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      navigateToFile({
        file_path: data.file_path,
        line_number: data.line_number,
      });
    }
  };

  const nodeStyles: React.CSSProperties = {
    padding: "10px",
    borderRadius: "5px",
    backgroundColor: data.is_entry_point
      ? themeStyles.colors.node.background.entryPoint
      : themeStyles.colors.node.background.default,
    border: `${selected ? 3 : data.is_entry_point ? 2 : 1}px solid ${
      selected ? themeStyles.colors.node.border.selected : themeStyles.colors.node.border.default
    }`,
    minWidth: "200px",
    maxWidth: "350px",
    cursor: "pointer",
    transition: "all 0.2s ease",
    outline: "none",
    position: "relative",
  };

  const headerStyles: React.CSSProperties = {
    fontWeight: "bold",
    fontSize: "14px",
    marginBottom: "8px",
    color: data.is_entry_point
      ? themeStyles.colors.node.text.entryPoint
      : themeStyles.colors.node.text.default,
    display: "flex",
    alignItems: "center",
    gap: "4px",
  };

  const description_styles: React.CSSProperties = {
    fontSize: "12px",
    color: themeStyles.colors.node.text.secondary,
    lineHeight: "1.4",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  const handle_color = themeStyles.colors.edge.stroke;

  const ariaLabel = `${data.is_entry_point ? 'Entry point function' : 'Function'}: ${data.function_name}. ${data.description || 'No description available'}. Located at ${data.file_path} line ${data.line_number}. Press Enter to navigate to source code.`;

  return (
    <div
      style={nodeStyles}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.02)";
        e.currentTarget.style.boxShadow = themeStyles.colors.shadow.hover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = "none";
      }}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-selected={selected}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: handle_color }}
      />

      <div style={headerStyles}>
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

export const CodeFunctionNode = React.memo(CodeFunctionNodeComponent, (prevProps, nextProps) => {
  const prev_data = prevProps.data as CodeNodeData;
  const next_data = nextProps.data as CodeNodeData;
  return (
    prev_data.function_name === next_data.function_name &&
    prev_data.description === next_data.description &&
    prev_data.file_path === next_data.file_path &&
    prev_data.line_number === next_data.line_number &&
    prev_data.is_entry_point === next_data.is_entry_point &&
    prevProps.selected === nextProps.selected &&
    prevProps.id === nextProps.id
  );
});
