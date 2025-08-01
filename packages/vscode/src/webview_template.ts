import * as vscode from 'vscode';

/**
 * Generate HTML content for the webview that loads the UI package
 */
export function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  colorCustomizations: any
): string {
  // Load the standalone UI build
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'node_modules', '@code-charter', 'ui', 'dist', 'standalone.global.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'node_modules', '@code-charter', 'ui', 'dist', 'standalone.css')
  );

  // Generate CSS variables for VSCode theme colors
  const editorColors = generateEditorColors(colorCustomizations);

  // Use a nonce to only allow a specific script to be run
  const nonce = getNonce();

  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
      <link href="${styleUri}" rel="stylesheet">
      <title>Code Charter</title>
      <style>
        :root {
          ${editorColors}
        }
        body {
          margin: 0;
          padding: 0;
        }
        #root {
          width: 100vw;
          height: 100vh;
        }
      </style>
    </head>
    <body>
      <div id="root"></div>
      <script nonce="${nonce}" src="${scriptUri}"></script>
      <script nonce="${nonce}">
        // Initialize the UI
        if (window.CodeCharterUI) {
          window.CodeCharterUI.init();
        }
      </script>
    </body>
    </html>`;
}

/**
 * Generate CSS variables for VSCode editor colors
 */
function generateEditorColors(colorCustomizations: any): string {
  const defaultColors = {
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
    'panel.border': '#454545',
    // Add more as needed
  };

  let cssVars = '';
  for (const [key, defaultValue] of Object.entries(defaultColors)) {
    const customValue = colorCustomizations[key] || defaultValue;
    const cssVarName = `--vscode-${key.replace(/\./g, '-')}`;
    cssVars += `${cssVarName}: ${customValue};\n`;
  }

  return cssVars;
}

/**
 * Generate a nonce for Content Security Policy
 */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}