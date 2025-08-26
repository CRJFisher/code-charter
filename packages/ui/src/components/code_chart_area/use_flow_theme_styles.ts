import { useMemo } from 'react';
import { useTheme } from '../../theme/theme_context';
import { getThemeColors } from './theme_config';

/**
 * Hook that provides theme-aware styles for React Flow components
 * This replaces the static CONFIG color values with dynamic theme colors
 */
export function useFlowThemeStyles() {
  const { theme } = useTheme();
  
  // Generate theme colors based on current theme
  const colors = useMemo(() => getThemeColors(theme), [theme]);
  const isDark = theme.type === 'dark';
  
  return {
    colors,
    isDark,
    
    // Utility functions for common style patterns
    getNodeStyle: (selected: boolean = false, isEntryPoint: boolean = false) => ({
      backgroundColor: isEntryPoint ? colors.node.background.entryPoint : colors.node.background.default,
      border: `${selected ? 3 : 2}px solid ${selected ? colors.node.border.selected : colors.node.border.default}`,
      color: colors.node.text.default,
      transition: 'all 0.3s ease',
    }),
    
    getEdgeStyle: (selected: boolean = false) => ({
      stroke: selected ? colors.edge.strokeSelected : colors.edge.stroke,
      strokeWidth: 2,
    }),
    
    getButtonStyle: (variant: 'primary' | 'secondary' | 'danger' = 'primary') => ({
      backgroundColor: colors.ui.button[variant],
      color: colors.ui.button.text,
      border: 'none',
      borderRadius: '4px',
      padding: '8px 16px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
    
    getPanelStyle: () => ({
      backgroundColor: colors.ui.background.panel,
      border: `1px solid ${colors.ui.border}`,
      borderRadius: '8px',
    }),
    
    getOverlayStyle: () => ({
      backgroundColor: colors.ui.background.overlay,
      border: `1px solid ${colors.ui.border}`,
      borderRadius: '4px',
    }),
    
    getErrorStyle: () => ({
      backgroundColor: colors.ui.error.background,
      border: `1px solid ${colors.ui.error.border}`,
      color: colors.ui.error.text,
    }),
    
    getTextStyle: (variant: 'primary' | 'secondary' = 'primary') => ({
      color: colors.ui.text[variant],
    }),
  };
}