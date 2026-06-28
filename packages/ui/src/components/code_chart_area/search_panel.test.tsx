import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchPanel } from './search_panel';
import { ReactFlowProvider } from '@xyflow/react';
import '@testing-library/jest-dom';
const test_nodes = [
  {
    id: 'node1',
    type: 'code_function',
    position: { x: 0, y: 0 },
    data: {
      function_name: 'testFunction',
      description: 'This is a test function',
      file_path: '/test/file.ts',
      line_number: 10,
    },
  },
  {
    id: 'node2',
    type: 'code_function',
    position: { x: 100, y: 100 },
    data: {
      function_name: 'anotherFunction',
      description: 'Handles data processing',
      file_path: '/test/another.ts',
      line_number: 20,
    },
  },
  {
    id: 'module1',
    type: 'module_group',
    position: { x: 200, y: 200 },
    data: {
      module_name: 'TestModule',
      description: 'A test module',
      member_count: 5,
    },
  },
];
const mockSetCenter = jest.fn();
const mockSetNodes = jest.fn();
const mockGetNodes = jest.fn();
const mockGetNode = jest.fn();

jest.mock('@xyflow/react', () => ({
  ...jest.requireActual('@xyflow/react'),
  useReactFlow: () => ({
    getNodes: mockGetNodes,
    getNode: mockGetNode,
    setCenter: mockSetCenter,
    setNodes: mockSetNodes,
  }),
}));

describe('SearchPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNodes.mockReturnValue(test_nodes);
    mockGetNode.mockImplementation((id: string) => test_nodes.find(n => n.id === id));
  });

  const renderSearchPanel = (props = {}) => {
    return render(
      <ReactFlowProvider>
        <SearchPanel {...props} />
      </ReactFlowProvider>
    );
  };

  it('renders the search button', () => {
    renderSearchPanel();

    const searchButton = screen.getByRole('button', { name: /search nodes/i });
    expect(searchButton).toBeInTheDocument();
    expect(searchButton).toHaveTextContent('/');
  });

  it('opens the panel when the button is clicked', async () => {
    renderSearchPanel();

    const searchButton = screen.getByRole('button', { name: /search nodes/i });
    fireEvent.click(searchButton);

    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    expect(searchInput).toBeInTheDocument();
  });

  it('opens the panel with the / key', async () => {
    renderSearchPanel();
    fireEvent.keyDown(window, { key: '/' });

    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText('Search functions, modules...');
      expect(searchInput).toBeInTheDocument();
    });
  });

  it('ignores the / key while typing in an input', () => {
    renderSearchPanel();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: '/' });

    const searchInput = screen.queryByPlaceholderText('Search functions, modules...');
    expect(searchInput).not.toBeInTheDocument();

    document.body.removeChild(input);
  });

  it('searches nodes by name', async () => {
    renderSearchPanel();
    const searchButton = screen.getByRole('button', { name: /search nodes/i });
    fireEvent.click(searchButton);
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    await userEvent.type(searchInput, 'test');

    // Check search results - testFunction and TestModule match "test"
    // anotherFunction does NOT match because its description is "Handles data processing"
    await waitFor(() => {
      const results = screen.getAllByRole('option');
      expect(results).toHaveLength(2);
    });
  });

  it('matches a node by its description when the name does not match', async () => {
    renderSearchPanel();
    fireEvent.click(screen.getByRole('button', { name: /search nodes/i }));
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    await userEvent.type(searchInput, 'processing');

    await waitFor(() => {
      const results = screen.getAllByRole('option');
      expect(results).toHaveLength(1);
      expect(results[0]).toHaveTextContent('anotherFunction');
    });
  });

  it('highlights matching text', async () => {
    renderSearchPanel();
    fireEvent.click(screen.getByRole('button', { name: /search nodes/i }));
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    await userEvent.type(searchInput, 'test');
    await waitFor(() => {
      const marks = screen.getAllByText('test', { selector: 'mark' });
      expect(marks.length).toBeGreaterThan(0);
    });
  });

  it('navigates results with arrow keys', async () => {
    renderSearchPanel();
    fireEvent.click(screen.getByRole('button', { name: /search nodes/i }));
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    await userEvent.type(searchInput, 'test');
    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    });
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(options[1]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('selects the node on Enter', async () => {
    const on_node_select = jest.fn();
    renderSearchPanel({ on_node_select });
    fireEvent.click(screen.getByRole('button', { name: /search nodes/i }));
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    await userEvent.type(searchInput, 'testFunction');
    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    });

    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(mockSetNodes).toHaveBeenCalledWith(expect.any(Function));
    expect(mockSetCenter).toHaveBeenCalledWith(0, 0, {
      zoom: 1,
      duration: 500,
    });
    expect(on_node_select).toHaveBeenCalledWith('node1');
  });

  it('selects the node on click', async () => {
    const on_node_select = jest.fn();
    renderSearchPanel({ on_node_select });
    fireEvent.click(screen.getByRole('button', { name: /search nodes/i }));
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    await userEvent.type(searchInput, 'test');
    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    });

    const firstOption = screen.getAllByRole('option')[0];
    fireEvent.click(firstOption);

    expect(mockSetNodes).toHaveBeenCalledWith(expect.any(Function));
    expect(mockSetCenter).toHaveBeenCalled();
    expect(on_node_select).toHaveBeenCalledWith('node1');
  });

  it('closes the panel on Escape', async () => {
    renderSearchPanel();
    fireEvent.click(screen.getByRole('button', { name: /search nodes/i }));
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    fireEvent.keyDown(searchInput, { key: 'Escape' });

    await waitFor(() => {
      expect(searchInput).not.toBeInTheDocument();
    });
  });

  it('shows the no-results message', async () => {
    renderSearchPanel();
    fireEvent.click(screen.getByRole('button', { name: /search nodes/i }));
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    await userEvent.type(searchInput, 'nonexistent');

    await waitFor(() => {
      expect(screen.getByText(/No results found for/)).toBeInTheDocument();
    });
  });

  it('matches nodes fuzzily', async () => {
    renderSearchPanel();
    fireEvent.click(screen.getByRole('button', { name: /search nodes/i }));
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    await userEvent.type(searchInput, 'tsfn');

    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    });
  });

  it('shows the icon for each node type', async () => {
    renderSearchPanel();
    fireEvent.click(screen.getByRole('button', { name: /search nodes/i }));
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    await userEvent.type(searchInput, 'test');

    await waitFor(() => {
      const options = screen.getAllByRole('option');
      // First result is testFunction (code_function) -> 🔧
      expect(options[0]).toHaveTextContent('🔧');
      // Second result is TestModule (module_group) -> 📦
      expect(options[1]).toHaveTextContent('📦');
    });
  });

  it('limits results to max_results', async () => {
    const manyNodes = Array.from({ length: 20 }, (_, i) => ({
      id: `node${i}`,
      type: 'code_function',
      position: { x: i * 10, y: i * 10 },
      data: {
        function_name: `testFunction${i}`,
        description: 'Test function',
      },
    }));

    mockGetNodes.mockReturnValue(manyNodes);
    mockGetNode.mockImplementation((id: string) => manyNodes.find(n => n.id === id));

    renderSearchPanel({ max_results: 5 });
    fireEvent.click(screen.getByRole('button', { name: /search nodes/i }));
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    await userEvent.type(searchInput, 'test');

    await waitFor(() => {
      const results = screen.getAllByRole('option');
      expect(results).toHaveLength(5);
      expect(screen.getByText('5 results')).toBeInTheDocument();
    });
  });
});
