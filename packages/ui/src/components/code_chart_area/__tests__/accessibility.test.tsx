import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CodeFunctionNode } from '../code_function_node';
import { ZoomAwareNode, ModuleGroupNode } from '../zoom_aware_node';
import { NodeProps } from '@xyflow/react';
import '@testing-library/jest-dom';

// Mock navigation utilities
jest.mock('../navigation_utils', () => ({
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

describe('Accessibility Features', () => {
  const mockNodeProps: NodeProps = {
    id: 'test-node',
    data: {
      function_name: 'testFunction',
      summary: 'Test function summary',
      file_path: '/test/file.ts',
      line_number: 42,
      is_entry_point: false,
      symbol: 'test::testFunction',
    },
    selected: false,
    type: 'code_function',
    xPos: 0,
    yPos: 0,
    zIndex: 0,
    isConnectable: true,
    dragging: false,
  };

  describe('CodeFunctionNode Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<CodeFunctionNode {...mockNodeProps} />);
      
      const node = screen.getByRole('button');
      expect(node).toHaveAttribute('aria-label', expect.stringContaining('Function: testFunction'));
      expect(node).toHaveAttribute('aria-label', expect.stringContaining('Test function summary'));
      expect(node).toHaveAttribute('aria-label', expect.stringContaining('/test/file.ts line 42'));
      expect(node).toHaveAttribute('tabIndex', '0');
      expect(node).toHaveAttribute('aria-selected', 'false');
    });

    it('should show selected state in ARIA attributes', () => {
      const selectedProps = { ...mockNodeProps, selected: true };
      render(<CodeFunctionNode {...selectedProps} />);
      
      const node = screen.getByRole('button');
      expect(node).toHaveAttribute('aria-selected', 'true');
    });

    it('should handle keyboard navigation', () => {
      const { navigateToFile } = require('../navigation_utils');
      render(<CodeFunctionNode {...mockNodeProps} />);
      
      const node = screen.getByRole('button');
      
      // Test Enter key
      fireEvent.keyDown(node, { key: 'Enter' });
      expect(navigateToFile).toHaveBeenCalledWith({
        file_path: '/test/file.ts',
        line_number: 42,
      });
      
      // Test Space key
      navigateToFile.mockClear();
      fireEvent.keyDown(node, { key: ' ' });
      expect(navigateToFile).toHaveBeenCalledWith({
        file_path: '/test/file.ts',
        line_number: 42,
      });
    });

    it('should have proper ARIA label for entry point', () => {
      const entryPointProps = {
        ...mockNodeProps,
        data: { ...mockNodeProps.data, is_entry_point: true },
      };
      render(<CodeFunctionNode {...entryPointProps} />);
      
      const node = screen.getByRole('button');
      expect(node).toHaveAttribute('aria-label', expect.stringContaining('Entry point function'));
      
      // Check for entry point indicator
      const entryIndicator = screen.getByLabelText('Entry point');
      expect(entryIndicator).toBeInTheDocument();
    });
  });

  describe('ZoomAwareNode Accessibility', () => {
    it('should have simplified ARIA label when zoomed out', () => {
      const { useStore } = require('@xyflow/react');
      useStore.mockReturnValue(0.3); // Zoomed out
      
      render(<ZoomAwareNode {...mockNodeProps} />);
      
      const node = screen.getByRole('button');
      expect(node).toHaveAttribute('aria-label', 'Function: testFunction. Press Enter to open source code.');
      expect(node).toHaveAttribute('tabIndex', '0');
    });

    it('should handle keyboard events in zoomed out view', () => {
      const { useStore } = require('@xyflow/react');
      const { navigateToFile } = require('../navigation_utils');
      useStore.mockReturnValue(0.3); // Zoomed out
      
      render(<ZoomAwareNode {...mockNodeProps} />);
      
      const node = screen.getByRole('button');
      fireEvent.keyDown(node, { key: 'Enter' });
      
      expect(navigateToFile).toHaveBeenCalledWith({
        file_path: '/test/file.ts',
        line_number: 42,
      });
    });
  });

  describe('ModuleGroupNode Accessibility', () => {
    it('should have proper ARIA attributes for module', () => {
      const { useStore } = require('@xyflow/react');
      useStore.mockReturnValue(0.3); // Zoomed out to show modules
      
      const moduleProps: NodeProps = {
        ...mockNodeProps,
        data: {
          module_name: 'TestModule',
          description: 'Test module description',
          member_count: 5,
          is_expanded: true,
        },
      };
      
      render(<ModuleGroupNode {...moduleProps} />);
      
      const module = screen.getByRole('group');
      expect(module).toHaveAttribute('aria-label', 'Module: TestModule. Test module description. Contains 5 functions.');
      expect(module).toHaveAttribute('tabIndex', '0');
      expect(module).toHaveAttribute('aria-selected', 'false');
    });

    it('should handle missing description gracefully', () => {
      const { useStore } = require('@xyflow/react');
      useStore.mockReturnValue(0.3); // Zoomed out
      
      const moduleProps: NodeProps = {
        ...mockNodeProps,
        data: {
          module_name: 'TestModule',
          description: '',
          member_count: 3,
          is_expanded: true,
        },
      };
      
      render(<ModuleGroupNode {...moduleProps} />);
      
      const module = screen.getByRole('group');
      expect(module).toHaveAttribute('aria-label', 'Module: TestModule. No description. Contains 3 functions.');
    });
  });

  describe('Focus Management', () => {
    it('should show focus indicators on selected nodes', () => {
      const selectedProps = { ...mockNodeProps, selected: true };
      const { container } = render(<CodeFunctionNode {...selectedProps} />);
      
      const node = container.querySelector('[role="button"]');
      const styles = window.getComputedStyle(node as Element);
      
      // Check for visual focus indicator (thicker border)
      expect(styles.borderWidth).toBe('3px');
    });
  });
});