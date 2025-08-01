/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        vscodeBg: 'var(--vscode-editor-background)',
        vscodeFg: 'var(--vscode-editor-foreground)',
        vscodeSelection: 'var(--vscode-editor-selectionBackground)',
        vscodeBorder: 'var(--vscode-panel-border)',
        vscodeGutter: 'var(--vscode-editorGutter-background)',
        vscodeLineNumber: 'var(--vscode-editorLineNumber-foreground)',
      }
    },
  },
  plugins: [],
}