import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { navigateToFile } from "./navigation_utils";

export interface CodeNodeData {
  function_name: string;
  summary: string;
  file_path: string;
  line_number: number;
  is_entry_point?: boolean;
  symbol: string;
}

export const CodeFunctionNode: React.FC<NodeProps<CodeNodeData>> = ({ data }) => {
  const handleClick = (e: React.MouseEvent) => {
    // Prevent node selection/dragging
    e.stopPropagation();
    
    navigateToFile({
      file_path: data.file_path,
      line_number: data.line_number,
    });
  };

  const nodeStyles: React.CSSProperties = {
    padding: "10px",
    borderRadius: "5px",
    backgroundColor: data.is_entry_point ? "#e8f5e9" : "#ffffff",
    border: `${data.is_entry_point ? 2 : 1}px solid #e0e0e0`,
    minWidth: "200px",
    maxWidth: "350px",
    cursor: "pointer",
    transition: "all 0.2s ease",
  };

  const headerStyles: React.CSSProperties = {
    fontWeight: "bold",
    fontSize: "14px",
    marginBottom: "8px",
    color: data.is_entry_point ? "#2e7d32" : "#333333",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  };

  const summaryStyles: React.CSSProperties = {
    fontSize: "12px",
    color: "#666666",
    lineHeight: "1.4",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  return (
    <div 
      style={nodeStyles}
      onClick={handleClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.02)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#555" }}
      />
      
      <div style={headerStyles}>
        {data.is_entry_point && <span>⮕</span>}
        <span>{data.function_name}</span>
      </div>
      
      {data.summary && (
        <div style={summaryStyles}>
          {data.summary}
        </div>
      )}
      
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "#555" }}
      />
    </div>
  );
};

// Node types mapping for React Flow
export const nodeTypes = {
  code_function: CodeFunctionNode,
};