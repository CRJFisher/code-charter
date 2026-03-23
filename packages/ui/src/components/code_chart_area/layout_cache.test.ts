import { renderHook, act, waitFor } from '@testing-library/react';
import { LayoutCache } from './layout_cache';
import { getVisibleNodes } from './virtual_renderer';
import { useDebounce } from '../../hooks/use_debounce';
import { calculateNodeDimensions } from './graph_layout';
import { CodeChartNode } from './chart_types';

describe('Performance Utilities', () => {
  describe('LayoutCache', () => {
    it('should cache and retrieve layout data', () => {
      const cache = new LayoutCache();
      const nodes = [
        { id: '1', position: { x: 0, y: 0 } },
        { id: '2', position: { x: 100, y: 100 } },
      ];
      const edges = [{ source: '1', target: '2' }];

      const key = cache.generateKey(nodes, edges);
      const layoutData = { test: 'data' };

      cache.set(key, layoutData);
      expect(cache.get(key)).toEqual(layoutData);
      expect(cache.size()).toBe(1);
    });

    it('should generate consistent keys for same data', () => {
      const cache = new LayoutCache();
      const nodes1 = [
        { id: '2', position: { x: 100, y: 100 } },
        { id: '1', position: { x: 0, y: 0 } },
      ];
      const nodes2 = [
        { id: '1', position: { x: 0, y: 0 } },
        { id: '2', position: { x: 100, y: 100 } },
      ];
      const edges = [{ source: '1', target: '2' }];

      const key1 = cache.generateKey(nodes1, edges);
      const key2 = cache.generateKey(nodes2, edges);

      expect(key1).toBe(key2);
    });

    it('should implement LRU eviction', () => {
      const cache = new LayoutCache();
      // Set max size to 50

      for (let i = 0; i < 60; i++) {
        const nodes = [{ id: `node-${i}`, position: { x: i, y: i } }];
        const edges: any[] = [];
        const key = cache.generateKey(nodes, edges);
        cache.set(key, { data: i });
      }

      // Should have evicted oldest entries
      expect(cache.size()).toBe(50);
    });
  });

  describe('getVisibleNodes', () => {
    it('should identify visible nodes within viewport', () => {
      const nodes = [
        { id: '1', position: { x: 0, y: 0 }, width: 200, height: 100 },
        { id: '2', position: { x: 300, y: 0 }, width: 200, height: 100 },
        { id: '3', position: { x: 1000, y: 1000 }, width: 200, height: 100 },
      ];

      const viewport = { x: 0, y: 0, zoom: 1 };
      const visible = getVisibleNodes(nodes, viewport, 800, 600);

      expect(visible.has('1')).toBe(true);
      expect(visible.has('2')).toBe(true);
      expect(visible.has('3')).toBe(false);
    });

    it('should include buffer area', () => {
      const nodes = [
        { id: '1', position: { x: -50, y: -50 }, width: 200, height: 100 },
        { id: '2', position: { x: 850, y: 0 }, width: 200, height: 100 },
      ];

      const viewport = { x: 0, y: 0, zoom: 1 };
      const visible = getVisibleNodes(nodes, viewport, 800, 600, 100);

      // Both nodes should be visible due to buffer
      expect(visible.has('1')).toBe(true);
      expect(visible.has('2')).toBe(true);
    });

    it('should handle zoom correctly', () => {
      const nodes = [
        { id: '1', position: { x: 0, y: 0 }, width: 200, height: 100 },
        { id: '2', position: { x: 500, y: 0 }, width: 200, height: 100 },
      ];

      const viewport = { x: 0, y: 0, zoom: 0.5 };
      const visible = getVisibleNodes(nodes, viewport, 400, 300);

      // With zoom 0.5, more area is visible
      expect(visible.has('1')).toBe(true);
      expect(visible.has('2')).toBe(true);
    });
  });


  describe('useDebounce', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('should debounce value changes', async () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: 'initial', delay: 500 } }
      );

      expect(result.current).toBe('initial');

      // Update value
      rerender({ value: 'updated', delay: 500 });
      expect(result.current).toBe('initial');

      // Fast forward time
      act(() => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(result.current).toBe('updated');
      });
    });
  });

  describe('Performance Benchmarks', () => {
    it('should handle 1000+ nodes efficiently', () => {
      const nodes: CodeChartNode[] = [];
      const edges: any[] = [];

      // Generate large graph
      for (let i = 0; i < 1000; i++) {
        nodes.push({
          id: `node-${i}`,
          type: 'code_function',
          position: { x: (i % 30) * 250, y: Math.floor(i / 30) * 150 },
          data: {
            function_name: `function_${i}`,
            description: 'Test function',
            file_path: '/test/file.ts',
            line_number: i,
            symbol: `test::function_${i}`,
          },
        });

        if (i > 0 && i % 3 === 0) {
          edges.push({
            id: `edge-${i}`,
            source: `node-${i - 1}`,
            target: `node-${i}`,
          });
        }
      }

      // Test layout cache performance
      const cache = new LayoutCache();
      const startTime = performance.now();

      const key = cache.generateKey(nodes, edges);
      cache.set(key, nodes);
      const retrieved = cache.get(key);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(retrieved).toBe(nodes);
      expect(duration).toBeLessThan(50); // Should be very fast

      // Test visible nodes calculation
      const viewportStart = performance.now();
      const visible = getVisibleNodes(
        nodes,
        { x: 0, y: 0, zoom: 1 },
        1920,
        1080
      );
      const viewportEnd = performance.now();
      const viewportDuration = viewportEnd - viewportStart;

      expect(visible.size).toBeGreaterThan(0);
      expect(visible.size).toBeLessThan(nodes.length);
      expect(viewportDuration).toBeLessThan(10); // Should be very fast
    });

    it('should cache node dimensions efficiently', () => {
      const testNode: CodeChartNode = {
        id: 'test-node',
        type: 'code_function',
        position: { x: 0, y: 0 },
        data: {
          function_name: 'testFunction',
          description: 'This is a test function with a longer description',
          file_path: '/test/file.ts',
          line_number: 42,
          symbol: 'test::testFunction',
        },
      };

      // First call should calculate
      const start1 = performance.now();
      const dimensions1 = calculateNodeDimensions(testNode);
      const duration1 = performance.now() - start1;

      // Second call should use cache
      const start2 = performance.now();
      const dimensions2 = calculateNodeDimensions(testNode);
      const duration2 = performance.now() - start2;

      expect(dimensions1).toEqual(dimensions2);
      expect(duration2).toBeLessThan(duration1); // Cached call should be faster
    });
  });
});
