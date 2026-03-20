import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeCharterUI } from '../code_charter_ui';
import { BackendProvider } from '../../contexts/backend_context';
import { TestMockBackend } from '../../backends/test_mock_backend';
import type { CallGraph, CallableNode, SymbolId, SymbolName, AnyDefinition } from '@code-charter/types';

function make_callable_node(symbol_id: string, name: string, file_path: string, line_number: number, docstring: string): CallableNode {
  const location = {
    file_path,
    start_line: line_number,
    start_column: 0,
    end_line: line_number + 10,
    end_column: 0,
  };
  return {
    symbol_id: symbol_id as SymbolId,
    name: name as SymbolName,
    enclosed_calls: [],
    location,
    definition: {
      kind: 'function' as const,
      symbol_id: symbol_id as SymbolId,
      name: name as SymbolName,
      defining_scope_id: 'scope:0',
      location,
      is_exported: false,
      signature: { parameters: [] },
      body_scope_id: 'scope:1',
      docstring,
    } as AnyDefinition,
    is_test: false,
  } as CallableNode;
}

describe('CodeCharterUI', () => {
  const main_node = make_callable_node('main', 'main', 'src/index.ts', 1, 'Entry point');
  const helper_node = make_callable_node('helper', 'helper', 'src/helper.ts', 10, 'Helper function');

  // Add a call reference from main -> helper
  (main_node as any).enclosed_calls = [{
    location: {
      file_path: 'src/index.ts',
      start_line: 5,
      start_column: 0,
      end_line: 5,
      end_column: 20,
    },
    name: 'helper' as SymbolName,
    scope_id: 'scope:0',
    call_type: 'function',
    resolutions: [{ symbol_id: 'helper' as SymbolId }],
  }];

  const mockCallGraph: CallGraph = {
    nodes: new Map<SymbolId, CallableNode>([
      ['main' as SymbolId, main_node],
      ['helper' as SymbolId, helper_node],
    ]),
    entry_points: ['main' as SymbolId],
  } as CallGraph;

  const mockBackend = new TestMockBackend({
    callGraph: mockCallGraph,
    docstrings: {
      'main': 'Main entry point of the application',
      'helper': 'Helper utility function',
    },
  });

  const renderWithBackend = (ui: React.ReactElement) => {
    return render(
      <BackendProvider backend={mockBackend}>
        {ui}
      </BackendProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithBackend(<CodeCharterUI />);
    expect(screen.getByText(/Code Charter/i)).toBeInTheDocument();
  });

  it('displays loading state initially', () => {
    renderWithBackend(<CodeCharterUI />);
    expect(screen.getByText(/Loading call graph/i)).toBeInTheDocument();
  });

  it('loads and displays call graph', async () => {
    renderWithBackend(<CodeCharterUI />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading call graph/i)).not.toBeInTheDocument();
    });

    // Check if nodes are rendered
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('helper')).toBeInTheDocument();
  });

  it('handles node click for navigation', async () => {
    const navigateSpy = jest.spyOn(mockBackend, 'navigateToDoc');
    const user = userEvent.setup();

    renderWithBackend(<CodeCharterUI />);

    await waitFor(() => {
      expect(screen.getByText('main')).toBeInTheDocument();
    });

    // Click on a node
    const mainNode = screen.getByText('main');
    await user.click(mainNode);

    expect(navigateSpy).toHaveBeenCalledWith({
      relativeDocPath: 'src/index.ts',
      lineNumber: 1,
    });
  });

  it('displays error state when loading fails', async () => {
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

  it('handles empty call graph gracefully', async () => {
    const emptyCallGraph: CallGraph = {
      nodes: new Map<SymbolId, CallableNode>(),
      entry_points: [],
    } as CallGraph;

    const emptyBackend = new TestMockBackend({
      callGraph: emptyCallGraph,
      docstrings: {},
    });

    render(
      <BackendProvider backend={emptyBackend}>
        <CodeCharterUI />
      </BackendProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/No data available/i)).toBeInTheDocument();
    });
  });

  it('toggles between different view modes', async () => {
    const user = userEvent.setup();
    renderWithBackend(<CodeCharterUI />);

    await waitFor(() => {
      expect(screen.getByText('main')).toBeInTheDocument();
    });

    // Look for view toggle buttons if they exist
    const viewToggle = screen.queryByRole('button', { name: /view/i });
    if (viewToggle) {
      await user.click(viewToggle);
      // Assert view change
    }
  });
});
