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

/**
 * Theme selector dropdown for multiple themes
 */
interface ThemeSelectorProps {
  className?: string;
}

export function ThemeSelector({ className = '' }: ThemeSelectorProps) {
  const { theme, setTheme, availableThemes, isStandalone } = useTheme();
  
  // Don't show in VSCode context
  if (!isStandalone || !setTheme || !availableThemes || availableThemes.length <= 1) {
    return null;
  }
  
  return (
    <select
      value={theme.name}
      onChange={(e) => {
        const selectedTheme = availableThemes.find(t => t.name === e.target.value);
        if (selectedTheme) {
          setTheme(selectedTheme);
        }
      }}
      className={`px-3 py-1 rounded-md border border-gray-300 dark:border-gray-600 
                  bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                  focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
    >
      {availableThemes.map(t => (
        <option key={t.name} value={t.name}>
          {t.name}
        </option>
      ))}
    </select>
  );
}