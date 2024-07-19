module.exports = {
  purge: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  darkMode: false, // or 'media' or 'class'
  theme: {
    extend: {
      colors: {
        // Text Colors
        vscodeFg: 'var(--vscode-editor-foreground)', // Main editor text color
        vscodeSelectionFg: 'var(--vscode-editor-selectionForeground)', // Selection text color

        // Background Colors
        vscodeBg: 'var(--vscode-editor-background)', // Main editor background color
        vscodeSelection: 'var(--vscode-editor-selectionBackground)', // Selection background color
        vscodeActiveLine: 'var(--vscode-editor-lineHighlightBackground)', // Active line background color
        vscodeInactiveSelection: 'var(--vscode-editor-inactiveSelectionBackground)', // Inactive selection background color

        // Border Colors
        vscodeBorder: 'var(--vscode-editor-widget-border)', // Editor widget border color

        // Line Numbers
        vscodeLineNumber: 'var(--vscode-editorLineNumber-foreground)', // Line number color
        vscodeActiveLineNumber: 'var(--vscode-editorLineNumber-activeForeground)', // Active line number color

        // Gutter
        vscodeGutter: 'var(--vscode-gutter-background)', // Gutter background color
        vscodeGutterBorder: 'var(--vscode-gutter-border)', // Gutter border color

        // Ruler
        vscodeRuler: 'var(--vscode-editor-rulerForeground)', // Ruler color

        // Cursor
        vscodeCursor: 'var(--vscode-editorCursor-foreground)', // Cursor color

        // Whitespace
        vscodeWhitespace: 'var(--vscode-editorWhitespace-foreground)', // Whitespace color

        // Comments
        vscodeComment: 'var(--vscode-editorComments-foreground)', // Comment text color

        // Selection Highlight
        vscodeSelectionHighlight: 'var(--vscode-editor-selectionHighlightBackground)', // Selection highlight color

        // Hover Highlight
        vscodeHoverHighlight: 'var(--vscode-editorHoverHighlight-background)', // Hover highlight color

        // Find Match Highlight
        vscodeFindMatchHighlight: 'var(--vscode-editor-findMatchHighlightBackground)', // Find match highlight color
        vscodeFindMatch: 'var(--vscode-editor-findMatchBackground)', // Find match color

        // Bracket Match
        vscodeBracketMatch: 'var(--vscode-editorBracketMatch-background)', // Bracket match color
        vscodeBracketMatchBorder: 'var(--vscode-editorBracketMatch-border)', // Bracket match border color

        // Overview Ruler
        vscodeOverviewRulerBorder: 'var(--vscode-editorOverviewRuler-border)', // Overview ruler border color
        vscodeOverviewRulerBackground: 'var(--vscode-editorOverviewRuler-background)', // Overview ruler background color

        // Syntax Highlighting Colors
        vscodeKeyword: 'var(--vscode-editor-keyword-foreground)', // Keywords
        vscodeFunction: 'var(--vscode-editor-function-foreground)', // Functions
        vscodeVariable: 'var(--vscode-editor-variable-foreground)', // Variables
        vscodeString: 'var(--vscode-editor-string-foreground)', // Strings
        vscodeNumber: 'var(--vscode-editor-number-foreground)', // Numbers
        vscodeBoolean: 'var(--vscode-editor-boolean-foreground)', // Booleans
        vscodeConstant: 'var(--vscode-editor-constant-foreground)', // Constants
        vscodeType: 'var(--vscode-editor-type-foreground)', // Types
        vscodeOperator: 'var(--vscode-editor-operator-foreground)', // Operators
        vscodeComment: 'var(--vscode-editor-comment-foreground)', // Comments
      },
    },
  },
  variants: {
    extend: {},
  },
  plugins: [],
}
