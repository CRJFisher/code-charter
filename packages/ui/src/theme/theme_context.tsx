import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Theme, ThemeProvider, ThemeContextValue } from '@code-charter/types';
import { VSCodeThemeProvider } from './vscode_theme_provider';
import { StandaloneThemeProvider } from './standalone_theme_provider';

/**
 * Theme context
 */
const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Detect if we're running in VSCode webview
 */
function isVSCodeContext(): boolean {
  return typeof acquireVsCodeApi !== 'undefined';
}

/**
 * Theme provider component props
 */
interface ThemeProviderProps {
  children: ReactNode;
  forceStandalone?: boolean; // For testing standalone mode
}

/**
 * Theme provider component
 */
export function ThemeProviderComponent({ children, forceStandalone = false }: ThemeProviderProps) {
  const [provider] = useState<ThemeProvider>(() => {
    if (!forceStandalone && isVSCodeContext()) {
      return new VSCodeThemeProvider();
    }
    return new StandaloneThemeProvider();
  });
  
  const [theme, setThemeState] = useState<Theme>(() => provider.getCurrentTheme());
  const isStandalone = forceStandalone || !isVSCodeContext();

  useEffect(() => {
    // Subscribe to theme changes
    const unsubscribe = provider.onThemeChange(setThemeState);
    
    return () => {
      unsubscribe();
      // Clean up provider if it has a dispose method
      if ('dispose' in provider && typeof provider.dispose === 'function') {
        provider.dispose();
      }
    };
  }, [provider]);

  const contextValue: ThemeContextValue = {
    theme,
    setTheme: isStandalone && 'setTheme' in provider && provider.setTheme ? provider.setTheme.bind(provider) : undefined,
    availableThemes: isStandalone && 'getAvailableThemes' in provider && provider.getAvailableThemes ? provider.getAvailableThemes() : undefined,
    isStandalone,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to use theme context
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

/**
 * Hook to get theme colors as CSS variables
 */
export function useThemeColors(): Record<string, string> {
  const { theme } = useTheme();
  
  return Object.entries(theme.colors).reduce((acc, [key, value]) => {
    // Convert to CSS variable format
    const cssVarName = `--vscode-${key.replace(/\./g, '-')}`;
    acc[cssVarName] = value;
    return acc;
  }, {} as Record<string, string>);
}

// Global declaration for VSCode API detection
declare const acquireVsCodeApi: any;