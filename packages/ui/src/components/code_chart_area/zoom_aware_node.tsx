import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { useStore, ReactFlowState } from "@xyflow/react";
import { CodeFunctionNode, CodeNodeData } from "./code_function_node";
import { navigateToFile } from "./navigation_utils";

const ZOOM_THRESHOLD = 0.45;

export const ZoomAwareNode: React.FC<NodeProps<CodeNodeData>> = (props) => {
  const zoom = useStore((state: ReactFlowState) => state.transform[2]);
  const isZoomedOut = zoom < ZOOM_THRESHOLD;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigateToFile({
      file_path: props.data.file_path,
      line_number: props.data.line_number,
    });
  };

  if (isZoomedOut) {
    // Simplified view when zoomed out
    return (
      <div
        style={{
          padding: "15px 20px",
          borderRadius: "8px",
          backgroundColor: props.data.is_entry_point ? "#e8f5e9" : "#f5f5f5",
          border: `2px solid ${props.data.is_entry_point ? "#4caf50" : "#e0e0e0"}`,
          minWidth: "150px",
          textAlign: "center",
          transition: "all 0.3s ease",
          cursor: "pointer",
        }}
        onClick={handleClick}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.05)";
          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
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
        
        <div
          style={{
            fontWeight: "bold",
            fontSize: "16px",
            color: props.data.is_entry_point ? "#2e7d32" : "#333333",
          }}
        >
          {props.data.is_entry_point && <span>⮕ </span>}
          {props.data.function_name}
        </div>
        
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ background: "#555" }}
        />
      </div>
    );
  }

  // Full detail view when zoomed in
  return <CodeFunctionNode {...props} />;
};

// Module group node for when clustering is implemented
export interface ModuleNodeData {
  module_name: string;
  description: string;
  member_count: number;
  is_expanded?: boolean;
}

export const ModuleGroupNode: React.FC<NodeProps<ModuleNodeData>> = ({ data }) => {
  const moduleStyles: React.CSSProperties = {
    padding: "20px",
    borderRadius: "10px",
    backgroundColor: "rgba(240, 240, 240, 0.8)",
    border: "2px solid #cccccc",
    minWidth: "250px",
    minHeight: "100px",
    transition: "all 0.3s ease",
  };

  const headerStyles: React.CSSProperties = {
    fontWeight: "bold",
    fontSize: "18px",
    marginBottom: "10px",
    color: "#1a1a1a",
  };

  const descriptionStyles: React.CSSProperties = {
    fontSize: "14px",
    color: "#666666",
    marginBottom: "8px",
  };

  const countStyles: React.CSSProperties = {
    fontSize: "12px",
    color: "#999999",
  };

  return (
    <div style={moduleStyles}>
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#888" }}
      />
      
      <div style={headerStyles}>
        {data.module_name}
      </div>
      
      {data.description && (
        <div style={descriptionStyles}>
          {data.description}
        </div>
      )}
      
      <div style={countStyles}>
        {data.member_count} functions
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "#888" }}
      />
    </div>
  );
};

// Updated node types mapping
export const zoomAwareNodeTypes = {
  code_function: ZoomAwareNode,
  module_group: ModuleGroupNode,
};