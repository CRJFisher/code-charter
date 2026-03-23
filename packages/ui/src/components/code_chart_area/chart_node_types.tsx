import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { useStore, ReactFlowState } from "@xyflow/react";
import { CodeFunctionNode, CodeNodeData } from "./code_function_node";
import { navigateToFile } from "./editor_navigation";
import { CONFIG } from "./chart_config";
import { useFlowThemeStyles } from "./use_chart_theme_styles";
import { get_cluster_color, ThemeColorConfig } from "./theme_config";
import type { CodeFunctionNodeType, ModuleGroupNodeType } from "./chart_types";

const ZOOM_THRESHOLD = CONFIG.zoom.levels.threshold;

// Derived boolean selector — only triggers re-renders on threshold crossings,
// not on every micro zoom change. This makes React.memo comparators effective.
const select_is_zoomed_out = (state: ReactFlowState) => state.transform[2] < ZOOM_THRESHOLD;

const ZoomAwareNodeComponent: React.FC<NodeProps<CodeFunctionNodeType>> = (props) => {
  const isZoomedOut = useStore(select_is_zoomed_out);
  const data = props.data;
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

function get_quality_color(score: number, colors: ThemeColorConfig): string {
  if (score >= 0.7) return colors.ui.success.text;
  if (score >= 0.4) return colors.ui.warning.text;
  return colors.ui.error.text;
}

const ModuleGroupNodeComponent: React.FC<NodeProps<ModuleGroupNodeType>> = (props) => {
  const data = props.data;
  const isZoomedOut = useStore(select_is_zoomed_out);
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
              backgroundColor: get_quality_color(data.quality_score, themeStyles.colors),
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
  return (
    prevProps.data.function_name === nextProps.data.function_name &&
    prevProps.data.description === nextProps.data.description &&
    prevProps.data.is_entry_point === nextProps.data.is_entry_point &&
    prevProps.selected === nextProps.selected &&
    prevProps.id === nextProps.id
  );
});

export const ModuleGroupNode = React.memo(ModuleGroupNodeComponent, (prevProps, nextProps) => {
  return (
    prevProps.data.module_name === nextProps.data.module_name &&
    prevProps.data.description === nextProps.data.description &&
    prevProps.data.member_count === nextProps.data.member_count &&
    prevProps.data.cluster_index === nextProps.data.cluster_index &&
    prevProps.data.quality_score === nextProps.data.quality_score &&
    prevProps.selected === nextProps.selected &&
    prevProps.id === nextProps.id
  );
});

// Updated node types mapping
export const zoomAwareNodeTypes = {
  code_function: ZoomAwareNode,
  module_group: ModuleGroupNode,
};