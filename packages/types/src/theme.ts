// Keys mirror VSCode's theme color contract so values can be read directly from VSCode CSS variables.
export interface ThemeColors {
  'editor.background': string;
  'editor.foreground': string;
  'editorWidget.border': string;
}

export interface Theme {
  name: string;
  type: 'light' | 'dark';
  colors: ThemeColors;
}

export interface ThemeProvider {
  get_current_theme(): Theme;

  // Mutation methods are present only in standalone mode; the VSCode provider derives its theme from the editor.
  set_theme?(theme: Theme): void;
  get_available_themes?(): Theme[];

  on_theme_change(callback: (theme: Theme) => void): () => void;
}

