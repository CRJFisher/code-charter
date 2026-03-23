import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CodeFunctionNode } from './code_function_node';
import { ZoomAwareNode, ModuleGroupNode } from './chart_node_types';
import { NodeProps, useStore } from '@xyflow/react';
import '@testing-library/jest-dom';
import { ThemeProviderComponent } from '../../theme/theme_context';
import { navigateToFile } from './editor_navigation';

const render_with_theme = (ui: React.ReactElement) => {
  return render(
    <ThemeProviderComponent forceStandalone>
      {ui}
    </ThemeProviderComponent>
  );
};

// Mock navigation utilities
jest.mock('./editor_navigation', () => ({
  navigateToFile: jest.fn(),
}));

// Mock React Flow store
jest.mock('@xyflow/react', () => ({
  ...jest.requireActual('@xyflow/react'),
  useStore: jest.fn(() => 0.5), // Default zoom level
  Handle: () => null,
  Position: {
    Top: 'top',
    Bottom: 'bottom',
  },
}));

const mocked_navigate = jest.mocked(navigateToFile);
const mocked_use_store = jest.mocked(useStore);

function create_node_props(overrides: Partial<NodeProps> = {}): NodeProps {
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
  } as NodeProps;
}

describe('Accessibility Features', () => {
  const mockNodeProps = create_node_props();

  describe('CodeFunctionNode Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render_with_theme(<CodeFunctionNode {...mockNodeProps} />);

      const node = screen.getByRole('button');
      expect(node).toHaveAttribute('aria-label', expect.stringContaining('Function: testFunction'));
      expect(node).toHaveAttribute('aria-label', expect.stringContaining('Test function description'));
      expect(node).toHaveAttribute('aria-label', expect.stringContaining('/test/file.ts line 42'));
      expect(node).toHaveAttribute('tabIndex', '0');
      expect(node).toHaveAttribute('aria-selected', 'false');
    });

    it('should show selected state in ARIA attributes', () => {
      const selectedProps = create_node_props({ selected: true });
      render_with_theme(<CodeFunctionNode {...selectedProps} />);

      const node = screen.getByRole('button');
      expect(node).toHaveAttribute('aria-selected', 'true');
    });

    it('should handle keyboard navigation', () => {
      render_with_theme(<CodeFunctionNode {...mockNodeProps} />);

      const node = screen.getByRole('button');

      // Test Enter key
      fireEvent.keyDown(node, { key: 'Enter' });
      expect(mocked_navigate).toHaveBeenCalledWith({
        file_path: '/test/file.ts',
        line_number: 42,
      });

      // Test Space key
      mocked_navigate.mockClear();
      fireEvent.keyDown(node, { key: ' ' });
      expect(mocked_navigate).toHaveBeenCalledWith({
        file_path: '/test/file.ts',
        line_number: 42,
      });
    });

    it('should have proper ARIA label for entry point', () => {
      const entryPointProps = create_node_props({
        data: { ...mockNodeProps.data, is_entry_point: true },
      });
      render_with_theme(<CodeFunctionNode {...entryPointProps} />);

      const node = screen.getByRole('button');
      expect(node).toHaveAttribute('aria-label', expect.stringContaining('Entry point function'));

      // Check for entry point indicator
      const entryIndicator = screen.getByLabelText('Entry point');
      expect(entryIndicator).toBeInTheDocument();
    });
  });

  describe('ZoomAwareNode Accessibility', () => {
    it('should have simplified ARIA label when zoomed out', () => {
      mocked_use_store.mockReturnValue(0.3); // Zoomed out

      render_with_theme(<ZoomAwareNode {...mockNodeProps} />);

      const node = screen.getByRole('button');
      expect(node).toHaveAttribute('aria-label', 'Function: testFunction. Press Enter to open source code.');
      expect(node).toHaveAttribute('tabIndex', '0');
    });

    it('should handle keyboard events in zoomed out view', () => {
      mocked_use_store.mockReturnValue(0.3); // Zoomed out

      render_with_theme(<ZoomAwareNode {...mockNodeProps} />);

      const node = screen.getByRole('button');
      fireEvent.keyDown(node, { key: 'Enter' });

      expect(mocked_navigate).toHaveBeenCalledWith({
        file_path: '/test/file.ts',
        line_number: 42,
      });
    });
  });

  describe('ModuleGroupNode Accessibility', () => {
    it('should have proper ARIA attributes for module', () => {
      mocked_use_store.mockReturnValue(0.3); // Zoomed out to show modules

      const moduleProps = create_node_props({
        data: {
          module_name: 'TestModule',
          description: 'Test module description',
          member_count: 5,
          is_expanded: true,
        },
      });

      render_with_theme(<ModuleGroupNode {...moduleProps} />);

      const module = screen.getByRole('group');
      expect(module).toHaveAttribute('aria-label', 'Module: TestModule. Test module description. Contains 5 functions.');
      expect(module).toHaveAttribute('tabIndex', '0');
      expect(module).toHaveAttribute('aria-selected', 'false');
    });

    it('should handle missing description gracefully', () => {
      mocked_use_store.mockReturnValue(0.3); // Zoomed out

      const moduleProps = create_node_props({
        data: {
          module_name: 'TestModule',
          description: '',
          member_count: 3,
          is_expanded: true,
        },
      });

      render_with_theme(<ModuleGroupNode {...moduleProps} />);

      const module = screen.getByRole('group');
      expect(module).toHaveAttribute('aria-label', 'Module: TestModule. No description. Contains 3 functions.');
    });
  });

  describe('Focus Management', () => {
    it('should show focus indicators on selected nodes', () => {
      const selectedProps = create_node_props({ selected: true });
      const { container } = render_with_theme(<CodeFunctionNode {...selectedProps} />);

      const node = container.querySelector('[role="button"]');
      const styles = window.getComputedStyle(node as Element);

      // Check for visual focus indicator (thicker border)
      expect(styles.borderWidth).toBe('3px');
    });
  });
});
