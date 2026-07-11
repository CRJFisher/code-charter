import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CodeFunctionNode } from './code_function_node';
import { ZoomAwareNode, ModuleGroupNode } from './chart_node_types';
import { NodeProps } from '@xyflow/react';
import '@testing-library/jest-dom';
import { ThemeProviderComponent } from '../../theme/theme_context';
import { navigate_to_file } from './editor_navigation';
import type { CodeFunctionNodeType, ModuleGroupNodeType } from './chart_types';

const render_with_theme = (ui: React.ReactElement) => {
  return render(
    <ThemeProviderComponent force_standalone>
      {ui}
    </ThemeProviderComponent>
  );
};

jest.mock('./editor_navigation', () => ({
  navigate_to_file: jest.fn(),
}));

// Run the mocked useStore selector against a synthetic state so tests can drive zoom-level.
let mock_zoom = 0.5;
jest.mock('@xyflow/react', () => ({
  ...jest.requireActual('@xyflow/react'),
  useStore: jest.fn((selector: (state: { transform: number[]; nodes: unknown[] }) => unknown) => {
    const mock_state = { transform: [0, 0, mock_zoom], nodes: [] };
    return selector(mock_state);
  }),
  Handle: () => null,
  Position: {
    Top: 'top',
    Bottom: 'bottom',
  },
}));

const mocked_navigate = jest.mocked(navigate_to_file);

function create_code_node_props(overrides: Partial<NodeProps<CodeFunctionNodeType>> = {}): NodeProps<CodeFunctionNodeType> {
  return {
    id: 'test-node',
    data: {
      function_name: 'testFunction',
      description: 'Test function description',
      file_path: '/test/file.ts',
      line_number: 42,
      is_entry_point: false,
      symbol: 'test::testFunction',
    },
    selected: false,
    type: 'code_function',
    zIndex: 0,
    isConnectable: true,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    ...overrides,
  } as NodeProps<CodeFunctionNodeType>;
}

function create_module_node_props(overrides: Partial<NodeProps<ModuleGroupNodeType>> = {}): NodeProps<ModuleGroupNodeType> {
  return {
    id: 'test-module',
    data: {
      module_name: 'TestModule',
      description: 'Test module description',
      member_count: 5,
      is_expanded: true,
      cluster_index: 0,
    },
    selected: false,
    type: 'module_group',
    zIndex: 0,
    isConnectable: true,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    ...overrides,
  } as NodeProps<ModuleGroupNodeType>;
}

describe('Accessibility Features', () => {
  beforeEach(() => {
    // Above the level-of-detail threshold: the detailed node renders.
    mock_zoom = 0.5;
  });

  const mockCodeProps = create_code_node_props();

  describe('CodeFunctionNode Accessibility', () => {
    it('exposes ARIA attributes describing the function', () => {
      render_with_theme(<CodeFunctionNode {...mockCodeProps} />);

      const node = screen.getByRole('button');
      expect(node).toHaveAttribute('aria-label', expect.stringContaining('Function: testFunction'));
      expect(node).toHaveAttribute('aria-label', expect.stringContaining('Test function description'));
      expect(node).toHaveAttribute('aria-label', expect.stringContaining('/test/file.ts line 42'));
      expect(node).toHaveAttribute('tabIndex', '0');
      expect(node).toHaveAttribute('aria-selected', 'false');
    });

    it('reflects the selected state in aria-selected', () => {
      const selectedProps = create_code_node_props({ selected: true });
      render_with_theme(<CodeFunctionNode {...selectedProps} />);

      const node = screen.getByRole('button');
      expect(node).toHaveAttribute('aria-selected', 'true');
    });

    it('opens source on Enter and Space', () => {
      render_with_theme(<CodeFunctionNode {...mockCodeProps} />);

      const node = screen.getByRole('button');

      fireEvent.keyDown(node, { key: 'Enter' });
      expect(mocked_navigate).toHaveBeenCalledWith({
        file_path: '/test/file.ts',
        line_number: 42,
      });

      mocked_navigate.mockClear();
      fireEvent.keyDown(node, { key: ' ' });
      expect(mocked_navigate).toHaveBeenCalledWith({
        file_path: '/test/file.ts',
        line_number: 42,
      });
    });

    it('labels entry-point functions and shows an entry indicator', () => {
      const entry_pointProps = create_code_node_props({
        data: { ...mockCodeProps.data, is_entry_point: true },
      });
      render_with_theme(<CodeFunctionNode {...entry_pointProps} />);

      const node = screen.getByRole('button');
      expect(node).toHaveAttribute('aria-label', expect.stringContaining('Entry point function'));

      const entryIndicator = screen.getByLabelText('Entry point');
      expect(entryIndicator).toBeInTheDocument();
    });
  });

  describe('ZoomAwareNode Accessibility', () => {
    it('uses a simplified ARIA label when zoomed out', () => {
      mock_zoom = 0.3;

      render_with_theme(<ZoomAwareNode {...mockCodeProps} />);

      const node = screen.getByRole('button');
      expect(node).toHaveAttribute('aria-label', 'Function: testFunction. Press Enter to open source code.');
      expect(node).toHaveAttribute('tabIndex', '0');
    });

    it('opens source on Enter in the zoomed-out view', () => {
      mock_zoom = 0.3;

      render_with_theme(<ZoomAwareNode {...mockCodeProps} />);

      const node = screen.getByRole('button');
      fireEvent.keyDown(node, { key: 'Enter' });

      expect(mocked_navigate).toHaveBeenCalledWith({
        file_path: '/test/file.ts',
        line_number: 42,
      });
    });
  });

  describe('ModuleGroupNode Accessibility', () => {
    it('exposes ARIA attributes describing the module', () => {
      mock_zoom = 0.3;

      const moduleProps = create_module_node_props();

      render_with_theme(<ModuleGroupNode {...moduleProps} />);

      const module = screen.getByRole('group');
      expect(module).toHaveAttribute('aria-label', 'Module: TestModule. Test module description. Contains 5 functions.');
      expect(module).toHaveAttribute('tabIndex', '0');
      expect(module).toHaveAttribute('aria-selected', 'false');
    });

    it('labels a module with no description as "No description"', () => {
      mock_zoom = 0.3;

      const moduleProps = create_module_node_props({
        data: {
          module_name: 'TestModule',
          description: '',
          member_count: 3,
          is_expanded: true,
          cluster_index: 0,
        },
      });

      render_with_theme(<ModuleGroupNode {...moduleProps} />);

      const module = screen.getByRole('group');
      expect(module).toHaveAttribute('aria-label', 'Module: TestModule. No description. Contains 3 functions.');
    });
  });

  describe('Focus Management', () => {
    it('thickens the border of a selected node', () => {
      const selectedProps = create_code_node_props({ selected: true });
      const { container } = render_with_theme(<CodeFunctionNode {...selectedProps} />);

      const node = container.querySelector('[role="button"]');
      const styles = window.getComputedStyle(node as Element);

      expect(styles.borderWidth).toBe('3px');
    });
  });
});
