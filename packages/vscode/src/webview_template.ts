import * as vscode from 'vscode';

/**
 * Generate HTML content for the webview that loads the UI package
 */
export function get_webview_content(
  webview: vscode.Webview,
  extension_uri: vscode.Uri,
  color_customizations: Record<string, string>,
): string {
  const ui_dist_uri = vscode.Uri.joinPath(extension_uri, '..', 'ui', 'dist');
  const script_uri = webview.asWebviewUri(vscode.Uri.joinPath(ui_dist_uri, 'standalone.global.js'));
  const style_uri = webview.asWebviewUri(vscode.Uri.joinPath(ui_dist_uri, 'standalone.css'));

  const editor_colors = generate_editor_colors(color_customizations);
  const nonce = get_nonce();

  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; connect-src ${webview.cspSource};">
      <link href="${style_uri}" rel="stylesheet">
      <title>Code Charter</title>
      <style>
        :root {
          ${editor_colors}
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
      <script nonce="${nonce}" src="${script_uri}"></script>
      <script nonce="${nonce}">
        if (window.CodeCharterUI) {
          window.CodeCharterUI.init();
        }
      </script>
    </body>
    </html>`;
}

function generate_editor_colors(color_customizations: Record<string, string>): string {
  const default_colors = {
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
  };

  let css_vars = '';
  for (const [key, default_value] of Object.entries(default_colors)) {
    const custom_value = color_customizations[key] || default_value;
    const css_var_name = `--vscode-${key.replace(/\./g, '-')}`;
    css_vars += `${css_var_name}: ${custom_value};\n`;
  }

  return css_vars;
}

function get_nonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
