import { Theme } from '@code-charter/types';

/**
 * Default dark theme based on VSCode's Dark+ theme
 */
export const darkTheme: Theme = {
  name: 'Dark',
  type: 'dark',
  colors: {
    'editor.background': '#1e1e1e',
    'editor.foreground': '#d4d4d4',
    'editorWidget.border': '#454545',
  },
};

/**
 * Default light theme based on VSCode's Light+ theme
 */
export const lightTheme: Theme = {
  name: 'Light',
  type: 'light',
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#000000',
    'editorWidget.border': '#cccccc',
  },
};

/**
 * Default themes collection
 */
export const defaultThemes = [darkTheme, lightTheme];