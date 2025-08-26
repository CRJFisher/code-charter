import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useTheme } from '../../theme/theme_context';
import { getThemeColors, getThemeCssVariables, ThemeColorConfig } from './theme_config';

interface FlowThemeContextValue {
  colors: ThemeColorConfig;
  isDark: boolean;
}

const FlowThemeContext = createContext<FlowThemeContextValue | null>(null);

interface FlowThemeProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that adapts the VSCode theme to React Flow components
 */
export function FlowThemeProvider({ children }: FlowThemeProviderProps) {
  const { theme } = useTheme();
  
  // Generate theme colors based on current theme
  const colors = useMemo(() => getThemeColors(theme), [theme]);
  const isDark = theme.type === 'dark';
  
  // Apply CSS variables to the document
  useEffect(() => {
    const cssVars = getThemeCssVariables(colors);
    const root = document.documentElement;
    
    // Apply all CSS variables
    Object.entries(cssVars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    
    // Apply theme class for additional styling
    root.classList.toggle('flow-theme-dark', isDark);
    root.classList.toggle('flow-theme-light', !isDark);
    
    // Cleanup function
    return () => {
      Object.keys(cssVars).forEach(key => {
        root.style.removeProperty(key);
      });
      root.classList.remove('flow-theme-dark', 'flow-theme-light');
    };
  }, [colors, isDark]);
  
  const contextValue: FlowThemeContextValue = {
    colors,
    isDark,
  };
  
  return (
    <FlowThemeContext.Provider value={contextValue}>
      {children}
    </FlowThemeContext.Provider>
  );
}

/**
 * Hook to use flow theme colors
 */
export function useFlowTheme(): FlowThemeContextValue {
  const context = useContext(FlowThemeContext);
  if (!context) {
    throw new Error('useFlowTheme must be used within a FlowThemeProvider');
  }
  return context;
}

/**
 * Hook to get a specific theme color value
 */
export function useThemeColor(path: string): string {
  const { colors } = useFlowTheme();
  
  // Navigate through the nested object using the path
  const parts = path.split('.');
  let value: any = colors;
  
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      console.warn(`Theme color path not found: ${path}`);
      return '#000000'; // Fallback color
    }
  }
  
  if (typeof value !== 'string') {
    console.warn(`Theme color path did not resolve to a string: ${path}`);
    return '#000000'; // Fallback color
  }
  
  return value;
}