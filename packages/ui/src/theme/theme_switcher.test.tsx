import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { VsCodeApi } from '../platform/vscode_detection';
import { ThemeProviderComponent } from './theme_context';
import { ThemeSwitcher } from './theme_switcher';

describe('ThemeSwitcher', () => {
  afterEach(() => {
    localStorage.clear();
    globalThis.acquireVsCodeApi = undefined;
  });

  it('renders a toggle button in standalone mode', () => {
    const { getByRole } = render(
      <ThemeProviderComponent force_standalone>
        <ThemeSwitcher />
      </ThemeProviderComponent>
    );

    expect(getByRole('button')).toBeInTheDocument();
  });

  it('switches the theme when the toggle is clicked', () => {
    const { getByRole } = render(
      <ThemeProviderComponent force_standalone>
        <ThemeSwitcher />
      </ThemeProviderComponent>
    );

    const button = getByRole('button');
    const initial_label = button.getAttribute('aria-label');

    fireEvent.click(button);

    expect(button.getAttribute('aria-label')).not.toBe(initial_label);
  });

  it('renders nothing when running inside a VSCode webview', () => {
    const fake_api: VsCodeApi = {
      postMessage: () => undefined,
      getState: () => undefined,
      setState: () => undefined,
    };
    globalThis.acquireVsCodeApi = () => fake_api;

    const { container } = render(
      <ThemeProviderComponent>
        <ThemeSwitcher />
      </ThemeProviderComponent>
    );

    expect(container).toBeEmptyDOMElement();
  });
});
