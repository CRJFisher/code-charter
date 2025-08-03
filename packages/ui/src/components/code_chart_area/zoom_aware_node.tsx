import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { useStore, ReactFlowState } from "@xyflow/react";
import { CodeFunctionNode, CodeNodeData } from "./code_function_node";
import { navigateToFile } from "./navigation_utils";
import { CONFIG } from "./config";

const ZOOM_THRESHOLD = CONFIG.zoom.levels.threshold;

const ZoomAwareNodeComponent: React.FC<NodeProps> = (props) => {
  const zoom = useStore((state: ReactFlowState) => state.transform[2]);
  const isZoomedOut = zoom < ZOOM_THRESHOLD;
  const data = props.data as CodeNodeData;
  const { selected } = props;

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

  if (isZoomedOut) {
    const simplifiedAriaLabel = `${data.is_entry_point ? 'Entry point' : 'Function'}: ${data.function_name}. Press Enter to open source code.`;
    
    // Simplified view when zoomed out
    return (
      <div
        style={{
          padding: `${CONFIG.spacing.padding.large}px ${CONFIG.spacing.padding.xlarge}px`,
          borderRadius: `${CONFIG.spacing.borderRadius.large}px`,
          backgroundColor: data.is_entry_point ? "#e8f5e9" : CONFIG.color.node.background.default,
          border: `${selected ? CONFIG.node.visual.borderWidth.selected : CONFIG.node.visual.borderWidth.default}px solid ${selected ? CONFIG.color.node.border.selected : data.is_entry_point ? CONFIG.minimap.colors.entryPoint : CONFIG.color.node.background.module}`,
          minWidth: "150px",
          textAlign: "center",
          transition: "all 0.3s ease",
          cursor: "pointer",
          outline: "none",
        }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = `scale(${CONFIG.node.visual.scale.hover})`;
          e.currentTarget.style.boxShadow = CONFIG.color.shadow.hover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "none";
        }}
        role="button"
        tabIndex={0}
        aria-label={simplifiedAriaLabel}
        aria-selected={selected}
      >
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: CONFIG.color.ui.loading.spinner }}
        />
        
        <div
          style={{
            fontWeight: "bold",
            fontSize: `${CONFIG.spacing.fontSize.large}px`,
            color: data.is_entry_point ? CONFIG.color.node.text.entryPoint : CONFIG.color.node.text.default,
          }}
        >
          {data.is_entry_point && <span aria-label="Entry point">⮕ </span>}
          {data.function_name}
        </div>
        
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ background: CONFIG.color.ui.loading.spinner }}
        />
      </div>
    );
  }

  // Full detail view when zoomed in
  return <CodeFunctionNode {...props} />;
};

// Module group node for when clustering is implemented
export interface ModuleNodeData extends Record<string, unknown> {
  module_name: string;
  description: string;
  member_count: number;
  is_expanded?: boolean;
}

const ModuleGroupNodeComponent: React.FC<NodeProps> = (props) => {
  const data = props.data as ModuleNodeData;
  const zoom = useStore((state: ReactFlowState) => state.transform[2]);
  const isZoomedOut = zoom < ZOOM_THRESHOLD;
  const { selected } = props;
  
  // Only show module groups when zoomed out
  if (!isZoomedOut) {
    return null;
  }
  
  const moduleStyles: React.CSSProperties = {
    padding: `${CONFIG.spacing.padding.xlarge}px`,
    borderRadius: `${CONFIG.spacing.borderRadius.large}px`,
    backgroundColor: CONFIG.color.node.background.default,
    border: `${selected ? CONFIG.node.visual.borderWidth.selected : CONFIG.node.visual.borderWidth.default}px ${selected ? 'solid' : 'dashed'} ${selected ? CONFIG.color.node.border.selected : CONFIG.color.node.border.default}`,
    width: "100%",
    height: "100%",
    transition: "all 0.3s ease",
    display: "flex",
    flexDirection: "column",
    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.1)",
    outline: "none",
  };

  const headerStyles: React.CSSProperties = {
    fontWeight: "bold",
    fontSize: `${CONFIG.spacing.fontSize.xlarge}px`,
    marginBottom: "10px",
    color: CONFIG.color.ui.text.primary,
  };

  const descriptionStyles: React.CSSProperties = {
    fontSize: "14px",
    color: CONFIG.color.node.text.secondary,
    marginBottom: `${CONFIG.spacing.margin.medium}px`,
  };

  const countStyles: React.CSSProperties = {
    fontSize: `${CONFIG.spacing.fontSize.medium}px`,
    color: CONFIG.color.node.text.tertiary,
  };

  const moduleAriaLabel = `Module: ${data.module_name}. ${data.description || 'No description'}. Contains ${data.member_count} functions.`;
  
  return (
    <div 
      style={moduleStyles}
      role="group"
      tabIndex={0}
      aria-label={moduleAriaLabel}
      aria-selected={selected}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: CONFIG.color.node.border.module }}
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
        style={{ background: CONFIG.color.node.border.module }}
      />
    </div>
  );
};

// Memoize components for performance
export const ZoomAwareNode = React.memo(ZoomAwareNodeComponent, (prevProps, nextProps) => {
  const prevData = prevProps.data as CodeNodeData;
  const nextData = nextProps.data as CodeNodeData;
  
  return (
    prevData.function_name === nextData.function_name &&
    prevData.summary === nextData.summary &&
    prevData.is_entry_point === nextData.is_entry_point &&
    prevProps.selected === nextProps.selected &&
    prevProps.id === nextProps.id
  );
});

export const ModuleGroupNode = React.memo(ModuleGroupNodeComponent, (prevProps, nextProps) => {
  const prevData = prevProps.data as ModuleNodeData;
  const nextData = nextProps.data as ModuleNodeData;
  
  return (
    prevData.module_name === nextData.module_name &&
    prevData.description === nextData.description &&
    prevData.member_count === nextData.member_count &&
    prevProps.selected === nextProps.selected &&
    prevProps.id === nextProps.id
  );
});

// Updated node types mapping
export const zoomAwareNodeTypes = {
  code_function: ZoomAwareNode,
  module_group: ModuleGroupNode,
};