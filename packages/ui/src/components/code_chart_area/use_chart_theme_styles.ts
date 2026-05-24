import { useMemo } from 'react';
import { use_theme } from '../../theme/theme_context';
import { get_theme_colors } from './theme_config';
import { CONFIG } from './chart_config';

/**
 * Hook that provides theme-aware styles for React Flow components
 * This replaces the static CONFIG color values with dynamic theme colors
 */
export function use_flow_theme_styles() {
  const { theme } = use_theme();
  
  // Generate theme colors based on current theme
  const colors = useMemo(() => get_theme_colors(theme), [theme]);
  const is_dark = theme.type === 'dark';
  
  return {
    colors,
    is_dark,
    
    // Utility functions for common style patterns
    get_node_style: (selected = false, is_entry_point = false) => ({
      backgroundColor: is_entry_point ? colors.node.background.entry_point : colors.node.background.default,
      border: `${selected ? CONFIG.node.visual.borderWidth.selected : CONFIG.node.visual.borderWidth.default}px solid ${selected ? colors.node.border.selected : colors.node.border.default}`,
      color: colors.node.text.default,
      transition: 'all 0.3s ease',
    }),
    
    get_edge_style: (selected = false) => ({
      stroke: selected ? colors.edge.strokeSelected : colors.edge.stroke,
      strokeWidth: 2,
    }),
    
    get_button_style: (variant: 'primary' | 'secondary' | 'danger' = 'primary') => ({
      backgroundColor: colors.ui.button[variant],
      color: colors.ui.button.text,
      border: 'none',
      borderRadius: '4px',
      padding: '8px 16px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
    
    get_panel_style: () => ({
      backgroundColor: colors.ui.background.panel,
      border: `1px solid ${colors.ui.border}`,
      borderRadius: '8px',
    }),
    
    get_overlay_style: () => ({
      backgroundColor: colors.ui.background.overlay,
      border: `1px solid ${colors.ui.border}`,
      borderRadius: '4px',
    }),
    
    get_error_style: () => ({
      backgroundColor: colors.ui.error.background,
      border: `1px solid ${colors.ui.error.border}`,
      color: colors.ui.error.text,
    }),
    
    get_text_style: (variant: 'primary' | 'secondary' = 'primary') => ({
      color: colors.ui.text[variant],
    }),
  };
}