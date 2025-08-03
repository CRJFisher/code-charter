import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { navigateToFile } from "./navigation_utils";

export interface CodeNodeData extends Record<string, unknown> {
  function_name: string;
  summary: string;
  file_path: string;
  line_number: number;
  is_entry_point?: boolean;
  symbol: string;
}

const CodeFunctionNodeComponent: React.FC<NodeProps<CodeNodeData>> = ({ data, selected }) => {
  const handleClick = (e: React.MouseEvent) => {
    // Prevent node selection/dragging
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
    backgroundColor: data.is_entry_point ? "#e8f5e9" : "#ffffff",
    border: `${data.is_entry_point ? 2 : 1}px solid ${selected ? '#0096FF' : '#e0e0e0'}`,
    borderWidth: selected ? "3px" : data.is_entry_point ? "2px" : "1px",
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

  // Create accessible label
  const ariaLabel = `${data.is_entry_point ? 'Entry point function' : 'Function'}: ${data.function_name}. ${data.summary || 'No description available'}. Located at ${data.file_path} line ${data.line_number}. Press Enter to navigate to source code.`;
  
  return (
    <div 
      style={nodeStyles}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.02)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
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
        style={{ background: "#555" }}
      />
      
      <div style={headerStyles}>
        {data.is_entry_point && <span aria-label="Entry point">⮕</span>}
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

// Memoize the component to prevent unnecessary re-renders
export const CodeFunctionNode = React.memo(CodeFunctionNodeComponent, (prevProps, nextProps) => {
  // Only re-render if data or selected state changes
  return (
    prevProps.data.function_name === nextProps.data.function_name &&
    prevProps.data.summary === nextProps.data.summary &&
    prevProps.data.file_path === nextProps.data.file_path &&
    prevProps.data.line_number === nextProps.data.line_number &&
    prevProps.data.is_entry_point === nextProps.data.is_entry_point &&
    prevProps.selected === nextProps.selected &&
    prevProps.id === nextProps.id
  );
});

// Node types mapping for React Flow
export const nodeTypes = {
  code_function: CodeFunctionNode,
};