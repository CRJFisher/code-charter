import React from 'react';
import { use_theme } from './theme_context';

/**
 * Theme switcher component for standalone mode
 */
export function ThemeSwitcher() {
  const { theme, set_theme, available_themes, is_standalone } = use_theme();
  
  // Don't show in VSCode context
  if (!is_standalone || !set_theme || !available_themes) {
    return null;
  }
  
  const toggle_theme = () => {
    const new_theme = available_themes.find(t => t.type !== theme.type);
    if (new_theme) {
      set_theme(new_theme);
    }
  };
  
  return (
    <button
      onClick={toggle_theme}
      className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      aria-label={`Switch to ${theme.type === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${theme.type === 'dark' ? 'light' : 'dark'} theme`}
    >
      {theme.type === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}

