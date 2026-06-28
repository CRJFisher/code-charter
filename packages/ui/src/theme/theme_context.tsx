import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Theme, ThemeProvider } from '@code-charter/types';
import { VSCodeThemeProvider } from './vscode_theme_provider';
import { StandaloneThemeProvider } from './standalone_theme_provider';
import { is_vscode_context } from '../platform/vscode_detection';

export interface ThemeContextValue {
  theme: Theme;
  set_theme?: (theme: Theme) => void;
  available_themes?: Theme[];
  is_standalone: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  // Bypasses VSCode detection so standalone rendering can be exercised in tests and non-editor hosts.
  force_standalone?: boolean;
}

export function ThemeProviderComponent({ children, force_standalone = false }: ThemeProviderProps) {
  const [provider] = useState<ThemeProvider>(() => {
    if (!force_standalone && is_vscode_context()) {
      return new VSCodeThemeProvider();
    }
    return new StandaloneThemeProvider();
  });
  
  const [theme, set_theme_state] = useState<Theme>(() => provider.get_current_theme());
  const is_standalone = force_standalone || !is_vscode_context();

  useEffect(() => {
    const unsubscribe = provider.on_theme_change(set_theme_state);

    return () => {
      unsubscribe();
      if ('dispose' in provider && typeof provider.dispose === 'function') {
        provider.dispose();
      }
    };
  }, [provider]);

  const context_value: ThemeContextValue = {
    theme,
    set_theme: is_standalone && 'set_theme' in provider && provider.set_theme ? provider.set_theme.bind(provider) : undefined,
    available_themes: is_standalone && 'get_available_themes' in provider && provider.get_available_themes ? provider.get_available_themes() : undefined,
    is_standalone,
  };

  return (
    <ThemeContext.Provider value={context_value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function use_theme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('use_theme must be used within a ThemeProvider');
  }
  return context;
}

