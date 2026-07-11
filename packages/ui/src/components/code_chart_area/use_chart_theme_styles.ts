import { useMemo } from 'react';
import { use_theme } from '../../theme/theme_context';
import { get_theme_colors } from './theme_config';
import { CONFIG } from './chart_config';
import { edge_style_for } from './edge_styling';

export function use_flow_theme_styles() {
  const { theme } = use_theme();

  const colors = useMemo(() => get_theme_colors(theme), [theme]);

  return {
    colors,

    get_node_style: (selected = false, is_entry_point = false) => ({
      backgroundColor: is_entry_point ? colors.node.background.entry_point : colors.node.background.default,
      border: `${selected ? CONFIG.node.visual.borderWidth.selected : CONFIG.node.visual.borderWidth.default}px solid ${selected ? colors.node.border.selected : colors.node.border.default}`,
      color: colors.node.text.default,
      transition: 'all 0.3s ease',
    }),

    // Per-edge styling routes through the same `edge_style_for` path so one styling
    // function governs both React Flow's default edge options and individual edges.
    get_edge_style: (selected = false) => edge_style_for({ selected }, colors),

    get_button_style: (variant: 'primary' | 'secondary' | 'danger' = 'primary') => ({
      backgroundColor: colors.ui.button[variant],
      color: colors.ui.button.text,
      border: 'none',
      borderRadius: '4px',
      padding: '8px 16px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
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
  };
}