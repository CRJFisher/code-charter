import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { VsCodeApi } from '../platform/vscode_detection';
import { ThemeProviderComponent, use_theme } from './theme_context';

function ThemeConsumer() {
  const ctx = use_theme();
  return (
    <div>
      <span data-testid="theme-name">{ctx.theme.name}</span>
      <span data-testid="theme-type">{ctx.theme.type}</span>
      <span data-testid="is-standalone">{String(ctx.is_standalone)}</span>
    </div>
  );
}

function ThemeSwitchConsumer() {
  const ctx = use_theme();
  const other = ctx.available_themes?.find(t => t.name !== ctx.theme.name);
  return (
    <div>
      <span data-testid="theme-name">{ctx.theme.name}</span>
      <span data-testid="available-count">{ctx.available_themes?.length ?? 0}</span>
      <span data-testid="has-set-theme">{String(Boolean(ctx.set_theme))}</span>
      <button onClick={() => other && ctx.set_theme?.(other)}>switch</button>
    </div>
  );
}

describe('ThemeProviderComponent', () => {
  afterEach(() => {
    localStorage.clear();
    globalThis.acquireVsCodeApi = undefined;
  });

  it('renders children', () => {
    const { getByText } = render(
      <ThemeProviderComponent force_standalone>
        <div>Test Child</div>
      </ThemeProviderComponent>
    );

    expect(getByText('Test Child')).toBeInTheDocument();
  });

  it('provides theme context to children via use_theme()', () => {
    const { getByTestId } = render(
      <ThemeProviderComponent force_standalone>
        <ThemeConsumer />
      </ThemeProviderComponent>
    );

    expect(getByTestId('theme-name').textContent).toBeTruthy();
    expect(getByTestId('is-standalone').textContent).toBe('true');
  });

  it('selects the VSCode provider when running inside a VSCode webview', () => {
    const fake_api: VsCodeApi = {
      postMessage: () => undefined,
      getState: () => undefined,
      setState: () => undefined,
    };
    globalThis.acquireVsCodeApi = () => fake_api;

    const { getByTestId } = render(
      <ThemeProviderComponent>
        <ThemeConsumer />
      </ThemeProviderComponent>
    );

    expect(getByTestId('is-standalone').textContent).toBe('false');
  });

  it('exposes set_theme and available themes in standalone mode', () => {
    const { getByTestId } = render(
      <ThemeProviderComponent force_standalone>
        <ThemeSwitchConsumer />
      </ThemeProviderComponent>
    );

    expect(getByTestId('available-count').textContent).toBe('2');
    expect(getByTestId('has-set-theme').textContent).toBe('true');
  });

  it('propagates theme changes from the provider to consumers', () => {
    const { getByTestId, getByText } = render(
      <ThemeProviderComponent force_standalone>
        <ThemeSwitchConsumer />
      </ThemeProviderComponent>
    );

    const initial = getByTestId('theme-name').textContent;
    fireEvent.click(getByText('switch'));

    expect(getByTestId('theme-name').textContent).not.toBe(initial);
  });

  it('throws when use_theme() is used outside the provider', () => {
    // React logs the thrown render error to console.error; silence it for this expected throw.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<ThemeConsumer />)).toThrow(
      'use_theme must be used within a ThemeProvider'
    );

    spy.mockRestore();
  });
});
