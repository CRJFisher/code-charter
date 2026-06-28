import { VSCodeThemeProvider } from './vscode_theme_provider';

function set_editor_background(color: string) {
  document.documentElement.style.setProperty('--vscode-editor-background', color);
}

describe('VSCodeThemeProvider', () => {
  afterEach(() => {
    const root = document.documentElement;
    root.style.removeProperty('--vscode-editor-background');
    root.style.removeProperty('--vscode-editor-foreground');
    root.style.removeProperty('--vscode-editor-widget-border');
  });

  it('get_current_theme() reads colors from VSCode CSS variables', () => {
    set_editor_background('#1e1e1e');
    document.documentElement.style.setProperty('--vscode-editor-foreground', '#d4d4d4');
    document.documentElement.style.setProperty('--vscode-editor-widget-border', '#454545');
    const provider = new VSCodeThemeProvider();

    const theme = provider.get_current_theme();

    expect(theme.name).toBe('VSCode Theme');
    expect(theme.colors['editor.background']).toBe('#1e1e1e');
    expect(theme.colors['editor.foreground']).toBe('#d4d4d4');
    expect(theme.colors['editorWidget.border']).toBe('#454545');
    provider.dispose();
  });

  it('get_current_theme() falls back to Dark+ defaults when CSS variables are absent', () => {
    const provider = new VSCodeThemeProvider();

    const theme = provider.get_current_theme();

    expect(theme.colors['editor.background']).toBe('#1e1e1e');
    expect(theme.colors['editor.foreground']).toBe('#d4d4d4');
    expect(theme.colors['editorWidget.border']).toBe('#454545');
    expect(theme.type).toBe('dark');
    provider.dispose();
  });

  it('get_current_theme() reports a dark type for a dark background', () => {
    set_editor_background('#1e1e1e');
    const provider = new VSCodeThemeProvider();

    expect(provider.get_current_theme().type).toBe('dark');
    provider.dispose();
  });

  it('get_current_theme() reports a light type for a light background', () => {
    set_editor_background('#ffffff');
    const provider = new VSCodeThemeProvider();

    expect(provider.get_current_theme().type).toBe('light');
    provider.dispose();
  });

  it('get_current_theme() treats luminance below 0.5 as dark at the boundary', () => {
    set_editor_background('#7f7f7f');
    const provider = new VSCodeThemeProvider();

    expect(provider.get_current_theme().type).toBe('dark');
    provider.dispose();
  });

  it('get_current_theme() treats luminance at or above 0.5 as light at the boundary', () => {
    set_editor_background('#808080');
    const provider = new VSCodeThemeProvider();

    expect(provider.get_current_theme().type).toBe('light');
    provider.dispose();
  });

  it('get_current_theme() defaults to dark for a non-hex background', () => {
    set_editor_background('rgb(255, 255, 255)');
    const provider = new VSCodeThemeProvider();

    expect(provider.get_current_theme().type).toBe('dark');
    provider.dispose();
  });

  it('on_theme_change() notifies listeners when documentElement style mutates', async () => {
    set_editor_background('#1e1e1e');
    const provider = new VSCodeThemeProvider();
    const received = new Promise<string>(resolve => {
      provider.on_theme_change(theme => resolve(theme.type));
    });

    set_editor_background('#ffffff');

    await expect(received).resolves.toBe('light');
    provider.dispose();
  });

  it('on_theme_change() returns an unsubscribe that stops notifications', async () => {
    set_editor_background('#1e1e1e');
    const provider = new VSCodeThemeProvider();
    const callback = jest.fn();
    const unsubscribe = provider.on_theme_change(callback);

    unsubscribe();
    set_editor_background('#ffffff');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(callback).not.toHaveBeenCalled();
    provider.dispose();
  });

  it('dispose() stops further theme-change notifications', async () => {
    set_editor_background('#1e1e1e');
    const provider = new VSCodeThemeProvider();
    const callback = jest.fn();
    provider.on_theme_change(callback);

    provider.dispose();
    set_editor_background('#ffffff');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(callback).not.toHaveBeenCalled();
  });
});
