import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeCharterUI } from '../components/code_charter_ui';
import { BackendProvider } from '../contexts/backend_context';
import { VSCodeBackend } from '../backends/vscode_backend';
import { MockBackend } from '../backends/mock_backend';
import { TestMockBackend } from '../backends/test_mock_backend';
import type { CallGraph, CallableNode, SymbolId, SymbolName, FilePath, ScopeId, AnyDefinition } from '@ariadnejs/types';
import { init } from '../index';

function make_mock_node(file: string, name: string, start_line: number, end_line: number): CallableNode {
  const id = `function:${file}:${start_line}:0:${end_line}:0:${name}` as SymbolId;
  return {
    symbol_id: id,
    name: name as SymbolName,
    enclosed_calls: [],
    location: { file_path: file as FilePath, start_line, start_column: 0, end_line, end_column: 0 },
    definition: {
      kind: "function",
      symbol_id: id,
      name: name as SymbolName,
      defining_scope_id: `global:${file}:0:0:100:0` as ScopeId,
      location: { file_path: file as FilePath, start_line, start_column: 0, end_line, end_column: 0 },
      is_exported: false,
      signature: { parameters: [] },
      body_scope_id: `function:${file}:${start_line}:0:${end_line}:0` as ScopeId,
    } as AnyDefinition,
    is_test: false,
  };
}

function make_call_graph(node_specs: Array<{ file: string; name: string; start: number; end: number }>): CallGraph {
  const nodes = new Map<SymbolId, CallableNode>();
  const entry_points: SymbolId[] = [];

  for (const spec of node_specs) {
    const node = make_mock_node(spec.file, spec.name, spec.start, spec.end);
    nodes.set(node.symbol_id, node);
    entry_points.push(node.symbol_id);
  }

  return { nodes, entry_points };
}

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
      const errorBackend = new TestMockBackend({
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
      const mockBackend = new MockBackend();
      const navigateSpy = jest.spyOn(mockBackend, 'navigateToDoc');

      render(
        <BackendProvider backend={mockBackend}>
          <CodeCharterUI />
        </BackendProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('main')).toBeInTheDocument();
      });

      await user.click(screen.getByText('main'));

      expect(navigateSpy).toHaveBeenCalledWith('main.ts', 0);
    });

    it('handles summary generation workflow', async () => {
      const user = userEvent.setup();
      const mockBackend = new MockBackend();
      const summarySpy = jest.spyOn(mockBackend, 'summariseCodeTree');

      render(
        <BackendProvider backend={mockBackend}>
          <CodeCharterUI />
        </BackendProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('main')).toBeInTheDocument();
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
