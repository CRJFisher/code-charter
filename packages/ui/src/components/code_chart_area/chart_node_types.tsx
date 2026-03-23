import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { useStore, ReactFlowState } from "@xyflow/react";
import { CodeFunctionNode, CodeNodeData } from "./code_function_node";
import { navigateToFile } from "./editor_navigation";
import { CONFIG } from "./chart_config";
import { useFlowThemeStyles } from "./use_chart_theme_styles";
import { get_cluster_color } from "./theme_config";

const ZOOM_THRESHOLD = CONFIG.zoom.levels.threshold;

const ZoomAwareNodeComponent: React.FC<NodeProps> = (props) => {
  const zoom = useStore((state: ReactFlowState) => state.transform[2]);
  const isZoomedOut = zoom < ZOOM_THRESHOLD;
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

  if (isZoomedOut) {
    const simplifiedAriaLabel = `${data.is_entry_point ? 'Entry point' : 'Function'}: ${data.function_name}. Press Enter to open source code.`;
    
    // Simplified view when zoomed out
    return (
      <div
        style={{
          padding: `${CONFIG.spacing.padding.large}px ${CONFIG.spacing.padding.xlarge}px`,
          borderRadius: `${CONFIG.spacing.borderRadius.large}px`,
          ...themeStyles.getNodeStyle(selected, data.is_entry_point),
          minWidth: "150px",
          textAlign: "center",
          cursor: "pointer",
          outline: "none",
        }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = `scale(${CONFIG.node.visual.scale.hover})`;
          e.currentTarget.style.boxShadow = themeStyles.colors.shadow.hover;
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
          style={{ background: themeStyles.colors.ui.loading.spinner }}
        />
        
        <div
          style={{
            fontWeight: "bold",
            fontSize: `${CONFIG.spacing.fontSize.large}px`,
            color: data.is_entry_point ? themeStyles.colors.node.text.entryPoint : themeStyles.colors.node.text.default,
          }}
        >
          {data.is_entry_point && <span aria-label="Entry point">⮕ </span>}
          {data.function_name}
        </div>
        
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ background: themeStyles.colors.ui.loading.spinner }}
        />
      </div>
    );
  }

  // Full detail view when zoomed in
  return <CodeFunctionNode {...props} />;
};

// Module group node for clustering
export interface ModuleNodeData extends Record<string, unknown> {
  module_name: string;
  description: string;
  member_count: number;
  is_expanded?: boolean;
  cluster_index: number;
  quality_score?: number;
}

function get_quality_color(score: number): string {
  if (score >= 0.7) return '#4caf50';
  if (score >= 0.4) return '#ff9800';
  return '#f44336';
}

const ModuleGroupNodeComponent: React.FC<NodeProps> = (props) => {
  const data = props.data as ModuleNodeData;
  const zoom = useStore((state: ReactFlowState) => state.transform[2]);
  const isZoomedOut = zoom < ZOOM_THRESHOLD;
  const { selected } = props;
  const themeStyles = useFlowThemeStyles();

  // Only show module groups when zoomed out
  if (!isZoomedOut) {
    return null;
  }

  const cluster_color = get_cluster_color(themeStyles.colors, data.cluster_index ?? 0);

  const moduleStyles: React.CSSProperties = {
    padding: `${CONFIG.spacing.padding.xlarge}px`,
    borderRadius: `${CONFIG.spacing.borderRadius.large}px`,
    backgroundColor: cluster_color.background,
    border: `${selected ? CONFIG.node.visual.borderWidth.selected : CONFIG.node.visual.borderWidth.default}px ${selected ? 'solid' : 'dashed'} ${selected ? themeStyles.colors.node.border.selected : cluster_color.border}`,
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
    color: themeStyles.colors.ui.text.primary,
  };

  const descriptionStyles: React.CSSProperties = {
    fontSize: "14px",
    color: themeStyles.colors.node.text.secondary,
    marginBottom: `${CONFIG.spacing.margin.medium}px`,
  };

  const countStyles: React.CSSProperties = {
    fontSize: `${CONFIG.spacing.fontSize.medium}px`,
    color: themeStyles.colors.node.text.tertiary,
  };

  const quality_label = data.quality_score !== undefined
    ? ` Cluster quality: ${(data.quality_score * 100).toFixed(0)} percent.`
    : '';
  const moduleAriaLabel = `Module: ${data.module_name}. ${data.description || 'No description'}. Contains ${data.member_count} functions.${quality_label}`;

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
        style={{ background: cluster_color.border }}
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

      {data.quality_score !== undefined && (
        <div style={{
          fontSize: '11px',
          color: themeStyles.colors.node.text.tertiary,
          marginTop: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: get_quality_color(data.quality_score),
            }}
            aria-hidden="true"
          />
          Quality: {(data.quality_score * 100).toFixed(0)}%
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: cluster_color.border }}
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
    prevData.description === nextData.description &&
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
    prevData.cluster_index === nextData.cluster_index &&
    prevData.quality_score === nextData.quality_score &&
    prevProps.selected === nextProps.selected &&
    prevProps.id === nextProps.id
  );
});

// Updated node types mapping
export const zoomAwareNodeTypes = {
  code_function: ZoomAwareNode,
  module_group: ModuleGroupNode,
};