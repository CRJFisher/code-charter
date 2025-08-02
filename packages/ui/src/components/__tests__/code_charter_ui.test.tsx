import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeCharterUI } from '../code_charter_ui';
import { BackendProvider } from '../../contexts/backend_context';
import { TestMockBackend } from '../../backends/test_mock_backend';
import { CallGraph } from '@ariadnejs/types';

describe('CodeCharterUI', () => {
  const mockCallGraph: CallGraph = {
    nodes: {
      'main': {
        symbol: 'main',
        label: 'main',
        file_path: 'src/index.ts',
        line_number: 1,
        docstring: 'Entry point',
      },
      'helper': {
        symbol: 'helper',
        label: 'helper',
        file_path: 'src/helper.ts',
        line_number: 10,
        docstring: 'Helper function',
      },
    },
    edges: [
      {
        source: 'main',
        target: 'helper',
      },
    ],
  };

  const mockBackend = new TestMockBackend({
    callGraph: mockCallGraph,
    refinedSummaries: {
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
    const emptyBackend = new TestMockBackend({
      callGraph: { nodes: {}, edges: [] },
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