import { Theme } from '@code-charter/types';

/**
 * Default dark theme based on VSCode's Dark+ theme
 */
export const darkTheme: Theme = {
  name: 'Dark',
  type: 'dark',
  colors: {
    // General Editor Colors
    'editor.background': '#1e1e1e',
    'editor.foreground': '#d4d4d4',
    'editor.selectionBackground': '#264f78',
    'editor.selectionForeground': '#ffffff',
    'editor.lineHighlightBackground': '#2b2b2b',
    'editor.inactiveSelectionBackground': '#3a3d41',
    'editorWidget.border': '#454545',
    'editorLineNumber.foreground': '#858585',
    'editorLineNumber.activeForeground': '#c6c6c6',
    'editorGutter.background': '#252526',
    'editorGutter.border': '#454545',
    'editorRuler.foreground': '#5a5a5a',
    'editorCursor.foreground': '#aeafad',
    'editorWhitespace.foreground': '#3b3a32',
    'editorComment.foreground': '#6a9955',
    'editor.selectionHighlightBackground': '#add6ff26',
    'editorHoverHighlight.background': '#264f78',
    'editor.findMatchHighlightBackground': '#ffd33d44',
    'editor.findMatchBackground': '#ffd33d22',
    'editorBracketMatch.background': '#a0a0a0',
    'editorBracketMatch.border': '#555555',
    'editorOverviewRuler.border': '#282828',
    'editorOverviewRuler.background': '#1e1e1e',
    
    // Panel and UI Colors
    'panel.border': '#454545',
    
    // Syntax Highlighting Colors
    'editor.keyword.foreground': '#569cd6',
    'editor.function.foreground': '#dcdcaa',
    'editor.variable.foreground': '#9cdcfe',
    'editor.string.foreground': '#ce9178',
    'editor.number.foreground': '#b5cea8',
    'editor.boolean.foreground': '#569cd6',
    'editor.constant.foreground': '#4ec9b0',
    'editor.type.foreground': '#4ec9b0',
    'editor.operator.foreground': '#d4d4d4',
    'editor.comment.foreground': '#6a9955',
  },
};

/**
 * Default light theme based on VSCode's Light+ theme
 */
export const lightTheme: Theme = {
  name: 'Light',
  type: 'light',
  colors: {
    // General Editor Colors
    'editor.background': '#ffffff',
    'editor.foreground': '#000000',
    'editor.selectionBackground': '#add6ff',
    'editor.selectionForeground': '#000000',
    'editor.lineHighlightBackground': '#f5f5f5',
    'editor.inactiveSelectionBackground': '#e5ebf1',
    'editorWidget.border': '#cccccc',
    'editorLineNumber.foreground': '#237893',
    'editorLineNumber.activeForeground': '#0b216f',
    'editorGutter.background': '#f8f8f8',
    'editorGutter.border': '#cccccc',
    'editorRuler.foreground': '#d3d3d3',
    'editorCursor.foreground': '#000000',
    'editorWhitespace.foreground': '#aaaaaa',
    'editorComment.foreground': '#008000',
    'editor.selectionHighlightBackground': '#add6ff80',
    'editorHoverHighlight.background': '#add6ff',
    'editor.findMatchHighlightBackground': '#ffd33d66',
    'editor.findMatchBackground': '#ffd33d44',
    'editorBracketMatch.background': '#b9b9b9',
    'editorBracketMatch.border': '#b9b9b9',
    'editorOverviewRuler.border': '#7f7f7f',
    'editorOverviewRuler.background': '#ffffff',
    
    // Panel and UI Colors
    'panel.border': '#cccccc',
    
    // Syntax Highlighting Colors
    'editor.keyword.foreground': '#0000ff',
    'editor.function.foreground': '#795e26',
    'editor.variable.foreground': '#001080',
    'editor.string.foreground': '#a31515',
    'editor.number.foreground': '#098658',
    'editor.boolean.foreground': '#0000ff',
    'editor.constant.foreground': '#0070c1',
    'editor.type.foreground': '#0070c1',
    'editor.operator.foreground': '#000000',
    'editor.comment.foreground': '#008000',
  },
};

/**
 * Default themes collection
 */
export const defaultThemes = [darkTheme, lightTheme];