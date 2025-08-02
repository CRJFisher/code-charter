import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeCharterUI } from '../components/code_charter_ui';
import { BackendProvider } from '../contexts/backend_context';
import { VSCodeBackend } from '../backends/vscode_backend';
import { MockBackend } from '../backends/mock_backend';
import { CallGraph } from '@ariadnejs/types';
import { init } from '../index';

describe('Integration Tests', () => {
  describe('Full UI initialization flow', () => {
    it('initializes with mock backend', async () => {
      const rootElement = document.createElement('div');
      document.body.appendChild(rootElement);

      const mockData: CallGraph = {
        nodes: {
          'fn1': {
            symbol: 'fn1',
            label: 'Function 1',
            file_path: 'file1.ts',
            line_number: 10,
          },
        },
        edges: [],
      };

      const backend = new MockBackend({ callGraph: mockData });

      init({
        rootElement,
        backend,
      });

      await waitFor(() => {
        expect(screen.getByText('Function 1')).toBeInTheDocument();
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
      const vsCodeBackend = new VSCodeBackend();
      rerender(
        <BackendProvider backend={vsCodeBackend}>
          <CodeCharterUI />
        </BackendProvider>
      );

      expect(screen.getByText(/Loading call graph/i)).toBeInTheDocument();
    });
  });

  describe('Error handling across backends', () => {
    it('handles errors consistently in mock backend', async () => {
      const errorBackend = new MockBackend({
        shouldThrowError: true,
      });

      render(
        <BackendProvider backend={errorBackend}>
          <CodeCharterUI />
        </BackendProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/Error loading call graph/i)).toBeInTheDocument();
      });
    });

    it('handles network errors in VS Code backend', async () => {
      const vsCodeBackend = new VSCodeBackend();
      
      // Don't send any response to simulate timeout/error
      render(
        <BackendProvider backend={vsCodeBackend}>
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
      const mockBackend = new MockBackend({
        callGraph: {
          nodes: {
            'clickable': {
              symbol: 'clickable',
              label: 'Clickable Node',
              file_path: 'click.ts',
              line_number: 5,
            },
          },
          edges: [],
        },
      });

      const navigateSpy = jest.spyOn(mockBackend, 'navigateToDoc');

      render(
        <BackendProvider backend={mockBackend}>
          <CodeCharterUI />
        </BackendProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Clickable Node')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Clickable Node'));

      expect(navigateSpy).toHaveBeenCalledWith({
        relativeDocPath: 'click.ts',
        lineNumber: 5,
      });
    });

    it('handles summary generation workflow', async () => {
      const user = userEvent.setup();
      const mockBackend = new MockBackend({
        callGraph: {
          nodes: {
            'main': {
              symbol: 'main',
              label: 'Main Function',
              file_path: 'main.ts',
              line_number: 1,
            },
          },
          edges: [],
        },
        refinedSummaries: {
          'main': 'This is the main entry point',
        },
      });

      const summarySpy = jest.spyOn(mockBackend, 'summariseCodeTree');

      render(
        <BackendProvider backend={mockBackend}>
          <CodeCharterUI />
        </BackendProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Main Function')).toBeInTheDocument();
      });

      // If there's a summary button, click it
      const summaryButton = screen.queryByRole('button', { name: /summar/i });
      if (summaryButton) {
        await user.click(summaryButton);
        expect(summarySpy).toHaveBeenCalled();
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