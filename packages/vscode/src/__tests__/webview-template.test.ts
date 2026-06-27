import * as vscode from "vscode";
import { get_webview_content } from "../webview_template";

function fake_uri(fs_path: string): vscode.Uri {
  const partial: Partial<vscode.Uri> = {
    fsPath: fs_path,
    scheme: "file",
    toString: () => `webview://${fs_path}`,
  };
  return partial as vscode.Uri;
}

function make_webview(): vscode.Webview {
  const partial: Partial<vscode.Webview> = {
    cspSource: "vscode-webview://test-source",
    asWebviewUri: (uri) => fake_uri(uri.fsPath),
  };
  return partial as vscode.Webview;
}

function render(color_customizations: Record<string, string> = {}): string {
  return get_webview_content(make_webview(), fake_uri("/ext"), color_customizations);
}

describe("get_webview_content", () => {
  beforeAll(() => {
    vscode.Uri.joinPath = (base, ...segments) =>
      fake_uri([base.fsPath, ...segments].join("/"));
  });

  it("restricts script execution to the per-render nonce", () => {
    const html = render();
    const nonce = html.match(/script-src 'nonce-([A-Za-z0-9]+)'/)?.[1];
    expect(nonce).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(html).toContain(`<script nonce="${nonce}" src=`);
    expect(html).toContain(`<script nonce="${nonce}">`);
  });

  it("scopes styles, images, fonts and connections to the webview csp source", () => {
    const html = render();
    expect(html).toContain(
      "default-src 'none'; style-src vscode-webview://test-source 'unsafe-inline'; script-src 'nonce-",
    );
    expect(html).toContain("img-src vscode-webview://test-source data:;");
    expect(html).toContain("font-src vscode-webview://test-source;");
    expect(html).toContain("connect-src vscode-webview://test-source;");
  });

  it("generates a fresh nonce on each render", () => {
    const nonce_of = (html: string) =>
      html.match(/script-src 'nonce-([A-Za-z0-9]+)'/)?.[1];
    expect(nonce_of(render())).not.toBe(nonce_of(render()));
  });

  it("loads the UI bundle and stylesheet from the sibling ui/dist directory", () => {
    const html = render();
    expect(html).toContain("ui/dist/standalone.global.js");
    expect(html).toContain("ui/dist/standalone.css");
  });

  it("falls back to default editor colors when no customization is provided", () => {
    const html = render();
    expect(html).toContain("--vscode-editor-background: #1e1e1e;");
    expect(html).toContain("--vscode-editor-foreground: #d4d4d4;");
  });

  it("overrides defaults with supplied color customizations", () => {
    const html = render({ "editor.background": "#abcdef" });
    expect(html).toContain("--vscode-editor-background: #abcdef;");
    expect(html).toContain("--vscode-editor-foreground: #d4d4d4;");
  });

  it("ignores color keys that are not part of the editor theme surface", () => {
    const html = render({ "terminal.background": "#000000" });
    expect(html).not.toContain("--vscode-terminal-background");
  });
});
