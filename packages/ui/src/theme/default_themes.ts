import { Theme } from '@code-charter/types';

// Color values mirror VSCode's Dark+ theme so the standalone webview matches the editor.
export const dark_theme: Theme = {
  name: 'Dark',
  type: 'dark',
  colors: {
    'editor.background': '#1e1e1e',
    'editor.foreground': '#d4d4d4',
    'editorWidget.border': '#454545',
  },
};

// Color values mirror VSCode's Light+ theme so the standalone webview matches the editor.
export const light_theme: Theme = {
  name: 'Light',
  type: 'light',
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#000000',
    'editorWidget.border': '#cccccc',
  },
};

export const default_themes = [dark_theme, light_theme];