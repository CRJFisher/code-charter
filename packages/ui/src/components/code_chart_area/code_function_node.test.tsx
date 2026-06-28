import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { NodeProps } from '@xyflow/react';
import '@testing-library/jest-dom';
import { CodeFunctionNode } from './code_function_node';
import { ThemeProviderComponent } from '../../theme/theme_context';
import { navigate_to_file } from './editor_navigation';
import type { CodeFunctionNodeType } from './chart_types';

jest.mock('./editor_navigation', () => ({
  navigate_to_file: jest.fn(),
}));

jest.mock('@xyflow/react', () => ({
  ...jest.requireActual('@xyflow/react'),
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
}));

const mocked_navigate = jest.mocked(navigate_to_file);

function create_props(data_overrides: Partial<CodeFunctionNodeType['data']> = {}): NodeProps<CodeFunctionNodeType> {
  return {
    id: 'test-node',
    data: {
      function_name: 'testFunction',
      description: 'Test function description',
      file_path: '/test/file.ts',
      line_number: 42,
      is_entry_point: false,
      symbol: 'test::testFunction',
      ...data_overrides,
    },
    type: 'code_function',
    selected: false,
    zIndex: 0,
    isConnectable: true,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  };
}

function render_node(props: NodeProps<CodeFunctionNodeType>) {
  return render(
    <ThemeProviderComponent force_standalone>
      <CodeFunctionNode {...props} />
    </ThemeProviderComponent>
  );
}

beforeEach(() => {
  mocked_navigate.mockClear();
});

describe('CodeFunctionNode', () => {
  it('navigates to the source file and line on click', () => {
    render_node(create_props());

    fireEvent.click(screen.getByRole('button'));

    expect(mocked_navigate).toHaveBeenCalledWith({
      file_path: '/test/file.ts',
      line_number: 42,
    });
  });

  it('ignores key presses other than Enter and Space', () => {
    render_node(create_props());

    fireEvent.keyDown(screen.getByRole('button'), { key: 'a' });

    expect(mocked_navigate).not.toHaveBeenCalled();
  });

  it('renders the description text when present', () => {
    render_node(create_props({ description: 'Sums two numbers' }));

    expect(screen.getByText('Sums two numbers')).toBeInTheDocument();
  });

  it('omits the description block and falls back in the aria label when description is empty', () => {
    render_node(create_props({ description: '' }));

    const node = screen.getByRole('button');
    expect(node).toHaveAttribute('aria-label', expect.stringContaining('No description available'));
    expect(screen.queryByText('Test function description')).not.toBeInTheDocument();
  });
});
