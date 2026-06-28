import { StandaloneThemeProvider } from './standalone_theme_provider';
import { dark_theme, light_theme } from './default_themes';

describe('StandaloneThemeProvider', () => {
  afterEach(() => {
    localStorage.clear();
    const root = document.documentElement;
    root.removeAttribute('data-theme-type');
    root.style.removeProperty('--vscode-editor-background');
    root.style.removeProperty('--vscode-editor-foreground');
    root.style.removeProperty('--vscode-editorWidget-border');
  });

  it('get_current_theme() returns the initial theme when provided', () => {
    const provider = new StandaloneThemeProvider(dark_theme);
    const theme = provider.get_current_theme();

    expect(theme.name).toBe(dark_theme.name);
    expect(theme.type).toBe('dark');
  });

  it('get_current_theme() restores the saved preference when no initial theme is given', () => {
    localStorage.setItem('code-charter-theme', light_theme.name);
    const provider = new StandaloneThemeProvider();

    expect(provider.get_current_theme().name).toBe(light_theme.name);
  });

  it('set_theme() changes the current theme', () => {
    const provider = new StandaloneThemeProvider(dark_theme);
    provider.set_theme(light_theme);

    const theme = provider.get_current_theme();
    expect(theme.name).toBe(light_theme.name);
    expect(theme.type).toBe('light');
  });

  it('set_theme() persists the choice to localStorage', () => {
    const provider = new StandaloneThemeProvider(dark_theme);
    provider.set_theme(light_theme);

    expect(localStorage.getItem('code-charter-theme')).toBe(light_theme.name);
  });

  it('set_theme() applies theme colors as vscode CSS variables', () => {
    const provider = new StandaloneThemeProvider(dark_theme);
    provider.set_theme(light_theme);

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--vscode-editor-background')).toBe(
      light_theme.colors['editor.background']
    );
    expect(root.getAttribute('data-theme-type')).toBe('light');
  });

  it('get_available_themes() returns the default light and dark themes', () => {
    const provider = new StandaloneThemeProvider();
    const themes = provider.get_available_themes();

    expect(themes).toHaveLength(2);
    expect(themes.some(t => t.type === 'dark')).toBe(true);
    expect(themes.some(t => t.type === 'light')).toBe(true);
  });

  it('on_theme_change() notifies listeners when theme is set', () => {
    const provider = new StandaloneThemeProvider(dark_theme);
    const callback = jest.fn();
    provider.on_theme_change(callback);

    provider.set_theme(light_theme);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(light_theme);
  });

  it('on_theme_change() notifies every registered listener', () => {
    const provider = new StandaloneThemeProvider(dark_theme);
    const first = jest.fn();
    const second = jest.fn();
    provider.on_theme_change(first);
    provider.on_theme_change(second);

    provider.set_theme(light_theme);

    expect(first).toHaveBeenCalledWith(light_theme);
    expect(second).toHaveBeenCalledWith(light_theme);
  });

  it('on_theme_change() returns an unsubscribe that stops notifications', () => {
    const provider = new StandaloneThemeProvider(dark_theme);
    const callback = jest.fn();
    const unsubscribe = provider.on_theme_change(callback);

    unsubscribe();
    provider.set_theme(light_theme);

    expect(callback).not.toHaveBeenCalled();
  });
});
