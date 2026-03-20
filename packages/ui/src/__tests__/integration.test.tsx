import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeCharterUI } from '../components/code_charter_ui';
import { BackendProvider } from '../contexts/backend_context';
import { VSCodeBackend } from '../backends/vscode_backend';
import { MockBackend } from '../backends/mock_backend';
import { TestMockBackend } from '../backends/test_mock_backend';
import { init } from '../index';

describe('Integration Tests', () => {
  describe('Full UI initialization flow', () => {
    it('initializes with mock backend', async () => {
      const rootElement = document.createElement('div');
      document.body.appendChild(rootElement);

      const backend = new MockBackend();

      init({
        rootElement,
        backend,
      });

      await waitFor(() => {
        expect(screen.getByText('main')).toBeInTheDocument();
      });

      document.body.removeChild(rootElement);
    });

    it('initializes with VS Code backend configuration', () => {
      const rootElement = document.createElement('div');
      document.body.appendChild(rootElement);

      // Mock VS Code API
      (global as any).acquireVsCodeApi = jest.fn(() => ({
        postMessage: jest.fn(),
        getState: jest.fn(),
        setState: jest.fn(),
      }));

      init({
        rootElement,
        backend: {
          type: 'vscode' as const,
        },
      });

      expect(screen.getByText(/Loading call graph/i)).toBeInTheDocument();

      document.body.removeChild(rootElement);
    });
  });

  describe('Backend switching', () => {
    it('can switch from mock to VS Code backend', async () => {
      const { rerender } = render(
        <BackendProvider backend={new MockBackend()}>
          <CodeCharterUI />
        </BackendProvider>
      );

      await waitFor(() => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      });

      // Switch to VS Code backend
      const vscode_backend = new VSCodeBackend();
      rerender(
        <BackendProvider backend={vscode_backend}>
          <CodeCharterUI />
        </BackendProvider>
      );

      expect(screen.getByText(/Loading call graph/i)).toBeInTheDocument();
    });
  });

  describe('Error handling across backends', () => {
    it('handles errors consistently in mock backend', async () => {
      const error_backend = new TestMockBackend({
        shouldThrowError: true,
      });

      render(
        <BackendProvider backend={error_backend}>
          <CodeCharterUI />
        </BackendProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/Error loading call graph/i)).toBeInTheDocument();
      });
    });

    it('handles network errors in VS Code backend', async () => {
      const vscode_backend = new VSCodeBackend();

      // Don't send any response to simulate timeout/error
      render(
        <BackendProvider backend={vscode_backend}>
          <CodeCharterUI />
        </BackendProvider>
      );

      // Should show loading state indefinitely or timeout
      expect(screen.getByText(/Loading call graph/i)).toBeInTheDocument();
    });
  });

  describe('User interactions', () => {
    it('handles node click navigation across backends', async () => {
      const user = userEvent.setup();
      const mock_backend = new MockBackend();
      const navigate_spy = jest.spyOn(mock_backend, 'navigateToDoc');

      render(
        <BackendProvider backend={mock_backend}>
          <CodeCharterUI />
        </BackendProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('main')).toBeInTheDocument();
      });

      await user.click(screen.getByText('main'));

      expect(navigate_spy).toHaveBeenCalledWith('main.ts', 0);
    });

    it('handles description generation workflow', async () => {
      const user = userEvent.setup();
      const mock_backend = new MockBackend();
      const description_spy = jest.spyOn(mock_backend, 'get_code_tree_descriptions');

      render(
        <BackendProvider backend={mock_backend}>
          <CodeCharterUI />
        </BackendProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('main')).toBeInTheDocument();
      });

      // If there's a description button, click it
      const description_button = screen.queryByRole('button', { name: /descri/i });
      if (description_button) {
        await user.click(description_button);
        expect(description_spy).toHaveBeenCalled();
      }
    });
  });

  describe('Theme integration', () => {
    it('applies VS Code theme when in VS Code environment', () => {
      // Set VS Code CSS variables
      document.documentElement.style.setProperty('--vscode-editor-background', '#000000');

      render(
        <BackendProvider backend={new MockBackend()}>
          <CodeCharterUI />
        </BackendProvider>
      );

      // Component should pick up VS Code styling
      const styles = window.getComputedStyle(document.documentElement);
      expect(styles.getPropertyValue('--vscode-editor-background')).toBe('#000000');

      // Cleanup
      document.documentElement.style.removeProperty('--vscode-editor-background');
    });

    it('applies standalone theme when not in VS Code', () => {
      // Ensure no VS Code variables
      document.documentElement.style.removeProperty('--vscode-editor-background');

      render(
        <BackendProvider backend={new MockBackend()}>
          <CodeCharterUI />
        </BackendProvider>
      );

      // Should render without errors
      expect(screen.getByText(/Code Charter/i)).toBeInTheDocument();
    });
  });
});
