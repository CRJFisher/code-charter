import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchPanel } from '../search_panel';
import { ReactFlowProvider } from '@xyflow/react';
import '@testing-library/jest-dom';

// Mock React Flow hooks
const mockSetCenter = jest.fn();
const mockSetNodes = jest.fn();
const mockGetNodes = jest.fn();

jest.mock('@xyflow/react', () => ({
  ...jest.requireActual('@xyflow/react'),
  useReactFlow: () => ({
    getNodes: mockGetNodes,
    setCenter: mockSetCenter,
    setNodes: mockSetNodes,
  }),
  useStore: (selector: any) => {
    const nodes = [
      {
        id: 'node1',
        type: 'code_function',
        position: { x: 0, y: 0 },
        data: {
          function_name: 'testFunction',
          summary: 'This is a test function',
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
          summary: 'Another test function',
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
    return selector({ nodes });
  },
}));

describe('SearchPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNodes.mockReturnValue([]);
  });

  const renderSearchPanel = (props = {}) => {
    return render(
      <ReactFlowProvider>
        <SearchPanel {...props} />
      </ReactFlowProvider>
    );
  };

  it('should render search button', () => {
    renderSearchPanel();
    
    const searchButton = screen.getByRole('button', { name: /search nodes/i });
    expect(searchButton).toBeInTheDocument();
    expect(searchButton).toHaveTextContent('/');
  });

  it('should open search panel when button is clicked', () => {
    renderSearchPanel();
    
    const searchButton = screen.getByRole('button', { name: /search nodes/i });
    fireEvent.click(searchButton);
    
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveFocus();
  });

  it('should open search panel with / key', async () => {
    renderSearchPanel();
    
    // Simulate pressing '/' key
    fireEvent.keyDown(window, { key: '/' });
    
    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText('Search functions, modules...');
      expect(searchInput).toBeInTheDocument();
    });
  });

  it('should not open search panel with / key when in input', () => {
    renderSearchPanel();
    
    // Create a temporary input element
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    
    // Simulate pressing '/' key while focused on input
    fireEvent.keyDown(input, { key: '/' });
    
    const searchInput = screen.queryByPlaceholderText('Search functions, modules...');
    expect(searchInput).not.toBeInTheDocument();
    
    document.body.removeChild(input);
  });

  it('should search for nodes by name', async () => {
    renderSearchPanel();
    
    // Open search panel
    const searchButton = screen.getByRole('button', { name: /search nodes/i });
    fireEvent.click(searchButton);
    
    // Type search query
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    await userEvent.type(searchInput, 'test');
    
    // Check search results
    await waitFor(() => {
      expect(screen.getByText('testFunction')).toBeInTheDocument();
      expect(screen.getByText('TestModule')).toBeInTheDocument();
      expect(screen.queryByText('anotherFunction')).not.toBeInTheDocument();
    });
  });

  it('should highlight matching text', async () => {
    renderSearchPanel();
    
    // Open search and search
    fireEvent.click(screen.getByRole('button', { name: /search nodes/i }));
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    await userEvent.type(searchInput, 'test');
    
    // Check for highlighted text
    await waitFor(() => {
      const marks = screen.getAllByText('test', { selector: 'mark' });
      expect(marks.length).toBeGreaterThan(0);
    });
  });

  it('should navigate search results with keyboard', async () => {
    renderSearchPanel();
    
    // Open search and search
    fireEvent.click(screen.getByRole('button', { name: /search nodes/i }));
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    await userEvent.type(searchInput, 'test');
    
    // Wait for results
    await waitFor(() => {
      expect(screen.getByText('testFunction')).toBeInTheDocument();
    });
    
    // Navigate with arrow keys
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    
    const options = screen.getAllByRole('option');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    
    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('should select node on Enter key', async () => {
    const onNodeSelect = jest.fn();
    renderSearchPanel({ onNodeSelect });
    
    // Open search and search
    fireEvent.click(screen.getByRole('button', { name: /search nodes/i }));
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    await userEvent.type(searchInput, 'testFunction');
    
    // Wait for results and press Enter
    await waitFor(() => {
      expect(screen.getByText('testFunction')).toBeInTheDocument();
    });
    
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    
    expect(mockSetNodes).toHaveBeenCalled();
    expect(mockSetCenter).toHaveBeenCalledWith(0, 0, {
      zoom: 1,
      duration: 500,
    });
    expect(onNodeSelect).toHaveBeenCalledWith('node1');
  });

  it('should select node on click', async () => {
    const onNodeSelect = jest.fn();
    renderSearchPanel({ onNodeSelect });
    
    // Open search and search
    fireEvent.click(screen.getByRole('button', { name: /search nodes/i }));
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    await userEvent.type(searchInput, 'test');
    
    // Click on result
    await waitFor(() => {
      const result = screen.getByText('testFunction');
      fireEvent.click(result.closest('li')!);
    });
    
    expect(mockSetNodes).toHaveBeenCalled();
    expect(mockSetCenter).toHaveBeenCalled();
    expect(onNodeSelect).toHaveBeenCalledWith('node1');
  });

  it('should close search panel on Escape key', async () => {
    renderSearchPanel();
    
    // Open search
    fireEvent.click(screen.getByRole('button', { name: /search nodes/i }));
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    
    // Press Escape
    fireEvent.keyDown(searchInput, { key: 'Escape' });
    
    await waitFor(() => {
      expect(searchInput).not.toBeInTheDocument();
    });
  });

  it('should show no results message', async () => {
    renderSearchPanel();
    
    // Open search and search for non-existent term
    fireEvent.click(screen.getByRole('button', { name: /search nodes/i }));
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    await userEvent.type(searchInput, 'nonexistent');
    
    await waitFor(() => {
      expect(screen.getByText('No results found for "nonexistent"')).toBeInTheDocument();
    });
  });

  it('should perform fuzzy matching', async () => {
    renderSearchPanel();
    
    // Open search and search with fuzzy term
    fireEvent.click(screen.getByRole('button', { name: /search nodes/i }));
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    await userEvent.type(searchInput, 'tsfn'); // Fuzzy match for testFunction
    
    await waitFor(() => {
      expect(screen.getByText('testFunction')).toBeInTheDocument();
    });
  });

  it('should show correct icons for node types', async () => {
    renderSearchPanel();
    
    // Open search and search
    fireEvent.click(screen.getByRole('button', { name: /search nodes/i }));
    const searchInput = screen.getByPlaceholderText('Search functions, modules...');
    await userEvent.type(searchInput, 'test');
    
    await waitFor(() => {
      // Function nodes should show 🔧
      const functionResult = screen.getByText('testFunction').closest('li');
      expect(functionResult).toHaveTextContent('🔧');
      
      // Module nodes should show 📦
      const moduleResult = screen.getByText('TestModule').closest('li');
      expect(moduleResult).toHaveTextContent('📦');
    });
  });

  it('should limit search results', async () => {
    // Add more nodes to test result limiting
    const manyNodes = Array.from({ length: 20 }, (_, i) => ({
      id: `node${i}`,
      type: 'code_function',
      position: { x: i * 10, y: i * 10 },
      data: {
        function_name: `testFunction${i}`,
        summary: 'Test function',
      },
    }));
    
    const { useStore } = require('@xyflow/react');
    useStore.mockImplementation((selector: any) => {
      return selector({ nodes: manyNodes });
    });
    
    renderSearchPanel({ maxResults: 5 });
    
    // Open search and search
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