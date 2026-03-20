import React from 'react';
import { useTheme } from './theme_context';

/**
 * Theme switcher component for standalone mode
 */
export function ThemeSwitcher() {
  const { theme, setTheme, availableThemes, isStandalone } = useTheme();
  
  // Don't show in VSCode context
  if (!isStandalone || !setTheme || !availableThemes) {
    return null;
  }
  
  const toggleTheme = () => {
    const newTheme = availableThemes.find(t => t.type !== theme.type);
    if (newTheme) {
      setTheme(newTheme);
    }
  };
  
  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      aria-label={`Switch to ${theme.type === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${theme.type === 'dark' ? 'light' : 'dark'} theme`}
    >
      {theme.type === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}

