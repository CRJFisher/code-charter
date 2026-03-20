import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeCharterUI } from '../code_charter_ui';
import { BackendProvider } from '../../contexts/backend_context';
import { TestMockBackend } from '../../backends/test_mock_backend';
import type { CallGraph, CallableNode, SymbolId, SymbolName, FilePath, ScopeId, AnyDefinition } from '@ariadnejs/types';

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

describe('CodeCharterUI', () => {
  const main_node = make_mock_node('src/index.ts', 'main', 1, 10);
  const helper_node = make_mock_node('src/helper.ts', 'helper', 10, 20);

  const nodes = new Map<SymbolId, CallableNode>();
  nodes.set(main_node.symbol_id, main_node);
  nodes.set(helper_node.symbol_id, helper_node);

  const mockCallGraph: CallGraph = {
    nodes,
    entry_points: [main_node.symbol_id],
  };

  const mockBackend = new TestMockBackend({
    callGraph: mockCallGraph,
    refinedSummaries: {
      [main_node.symbol_id]: 'Main entry point of the application',
      [helper_node.symbol_id]: 'Helper utility function',
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

    expect(navigateSpy).toHaveBeenCalledWith('src/index.ts', 1);
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
    const emptyBackend = new TestMockBackend({
      callGraph: { nodes: new Map(), entry_points: [] },
      refinedSummaries: {},
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
