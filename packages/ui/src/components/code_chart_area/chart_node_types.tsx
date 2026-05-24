import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { useStore, ReactFlowState } from "@xyflow/react";
import { CodeFunctionNode } from "./code_function_node";
import { navigate_to_file } from "./editor_navigation";
import { CONFIG } from "./chart_config";
import { use_flow_theme_styles } from "./use_chart_theme_styles";
import { get_cluster_color, ThemeColorConfig } from "./theme_config";
import type { CodeFunctionNodeType, ModuleGroupNodeType } from "./chart_types";

const ZOOM_THRESHOLD = CONFIG.zoom.levels.threshold;

// Derived boolean selector — only triggers re-renders on threshold crossings,
// not on every micro zoom change. This makes React.memo comparators effective.
const select_is_zoomed_out = (state: ReactFlowState) => state.transform[2] < ZOOM_THRESHOLD;

const ZoomAwareNodeComponent: React.FC<NodeProps<CodeFunctionNodeType>> = (props) => {
  const is_zoomed_out = useStore(select_is_zoomed_out);
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

  if (is_zoomed_out) {
    const simplified_aria_label = `${data.is_entry_point ? 'Entry point' : 'Function'}: ${data.function_name}. Press Enter to open source code.`;
    
    // Simplified view when zoomed out
    return (
      <div
        style={{
          padding: `${CONFIG.spacing.padding.large}px ${CONFIG.spacing.padding.xlarge}px`,
          borderRadius: `${CONFIG.spacing.borderRadius.large}px`,
          ...theme_styles.get_node_style(selected, data.is_entry_point),
          minWidth: "150px",
          textAlign: "center",
          cursor: "pointer",
          outline: "none",
        }}
        onClick={handle_click}
        onKeyDown={handle_key_down}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = `scale(${CONFIG.node.visual.scale.hover})`;
          e.currentTarget.style.boxShadow = theme_styles.colors.shadow.hover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "none";
        }}
        role="button"
        tabIndex={0}
        aria-label={simplified_aria_label}
        aria-selected={selected}
      >
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: theme_styles.colors.ui.loading.spinner }}
        />
        
        <div
          style={{
            fontWeight: "bold",
            fontSize: `${CONFIG.spacing.fontSize.large}px`,
            color: data.is_entry_point ? theme_styles.colors.node.text.entry_point : theme_styles.colors.node.text.default,
          }}
        >
          {data.is_entry_point && <span aria-label="Entry point">⮕ </span>}
          {data.function_name}
        </div>
        
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ background: theme_styles.colors.ui.loading.spinner }}
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
  const is_zoomed_out = useStore(select_is_zoomed_out);
  const { selected } = props;
  const theme_styles = use_flow_theme_styles();

  // Only show module groups when zoomed out
  if (!is_zoomed_out) {
    return null;
  }

  const cluster_color = get_cluster_color(theme_styles.colors, data.cluster_index ?? 0);

  const module_styles: React.CSSProperties = {
    padding: `${CONFIG.spacing.padding.xlarge}px`,
    borderRadius: `${CONFIG.spacing.borderRadius.large}px`,
    backgroundColor: cluster_color.background,
    border: `${selected ? CONFIG.node.visual.borderWidth.selected : CONFIG.node.visual.borderWidth.default}px ${selected ? 'solid' : 'dashed'} ${selected ? theme_styles.colors.node.border.selected : cluster_color.border}`,
    width: "100%",
    height: "100%",
    transition: "all 0.3s ease",
    display: "flex",
    flexDirection: "column",
    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.1)",
    outline: "none",
  };

  const header_styles: React.CSSProperties = {
    fontWeight: "bold",
    fontSize: `${CONFIG.spacing.fontSize.xlarge}px`,
    marginBottom: "10px",
    color: theme_styles.colors.ui.text.primary,
  };

  const description_styles: React.CSSProperties = {
    fontSize: "14px",
    color: theme_styles.colors.node.text.secondary,
    marginBottom: `${CONFIG.spacing.margin.medium}px`,
  };

  const count_styles: React.CSSProperties = {
    fontSize: `${CONFIG.spacing.fontSize.medium}px`,
    color: theme_styles.colors.node.text.tertiary,
  };

  const quality_label = data.quality_score !== undefined
    ? ` Cluster quality: ${(data.quality_score * 100).toFixed(0)} percent.`
    : '';
  const module_aria_label = `Module: ${data.module_name}. ${data.description || 'No description'}. Contains ${data.member_count} functions.${quality_label}`;

  return (
    <div
      style={module_styles}
      role="group"
      tabIndex={0}
      aria-label={module_aria_label}
      aria-selected={selected}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: cluster_color.border }}
      />

      <div style={header_styles}>
        {data.module_name}
      </div>

      {data.description && (
        <div style={description_styles}>
          {data.description}
        </div>
      )}

      <div style={count_styles}>
        {data.member_count} functions
      </div>

      {data.quality_score !== undefined && (
        <div style={{
          fontSize: '11px',
          color: theme_styles.colors.node.text.tertiary,
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
              backgroundColor: get_quality_color(data.quality_score, theme_styles.colors),
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
export const ZoomAwareNode = React.memo(ZoomAwareNodeComponent, (prev_props, next_props) => {
  return (
    prev_props.data.function_name === next_props.data.function_name &&
    prev_props.data.description === next_props.data.description &&
    prev_props.data.is_entry_point === next_props.data.is_entry_point &&
    prev_props.selected === next_props.selected &&
    prev_props.id === next_props.id
  );
});

export const ModuleGroupNode = React.memo(ModuleGroupNodeComponent, (prev_props, next_props) => {
  return (
    prev_props.data.module_name === next_props.data.module_name &&
    prev_props.data.description === next_props.data.description &&
    prev_props.data.member_count === next_props.data.member_count &&
    prev_props.data.cluster_index === next_props.data.cluster_index &&
    prev_props.data.quality_score === next_props.data.quality_score &&
    prev_props.selected === next_props.selected &&
    prev_props.id === next_props.id
  );
});

// Updated node types mapping
export const zoom_aware_node_types = {
  code_function: ZoomAwareNode,
  module_group: ModuleGroupNode,
};