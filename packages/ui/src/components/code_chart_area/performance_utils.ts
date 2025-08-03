import React, { useMemo, useRef, useEffect, useState } from 'react';

// Performance monitoring utilities
export interface PerformanceMetrics {
  layoutTime: number;
  renderTime: number;
  nodeCount: number;
  edgeCount: number;
  timestamp: number;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private startTime: number = 0;

  startMeasure(label: string) {
    this.startTime = performance.now();
    console.log(`[Performance] Starting ${label}`);
  }

  endMeasure(label: string, nodeCount: number, edgeCount: number) {
    const duration = performance.now() - this.startTime;
    console.log(`[Performance] ${label} took ${duration.toFixed(2)}ms for ${nodeCount} nodes and ${edgeCount} edges`);
    
    this.metrics.push({
      layoutTime: label.includes('layout') ? duration : 0,
      renderTime: label.includes('render') ? duration : 0,
      nodeCount,
      edgeCount,
      timestamp: Date.now(),
    });
  }

  getAverageMetrics(): PerformanceMetrics | null {
    if (this.metrics.length === 0) return null;
    
    const sum = this.metrics.reduce((acc, metric) => ({
      layoutTime: acc.layoutTime + metric.layoutTime,
      renderTime: acc.renderTime + metric.renderTime,
      nodeCount: acc.nodeCount + metric.nodeCount,
      edgeCount: acc.edgeCount + metric.edgeCount,
      timestamp: Date.now(),
    }), {
      layoutTime: 0,
      renderTime: 0,
      nodeCount: 0,
      edgeCount: 0,
      timestamp: 0,
    });
    
    const count = this.metrics.length;
    return {
      layoutTime: sum.layoutTime / count,
      renderTime: sum.renderTime / count,
      nodeCount: sum.nodeCount / count,
      edgeCount: sum.edgeCount / count,
      timestamp: sum.timestamp,
    };
  }

  clear() {
    this.metrics = [];
  }
}

// Layout cache for memoization
export class LayoutCache {
  private cache = new Map<string, any>();
  private maxSize = 50;

  generateKey(nodes: any[], edges: any[]): string {
    // Create a stable key based on node IDs and positions
    const nodeKey = nodes
      .map(n => `${n.id}:${n.position?.x || 0}:${n.position?.y || 0}`)
      .sort()
      .join('|');
    const edgeKey = edges
      .map(e => `${e.source}-${e.target}`)
      .sort()
      .join('|');
    return `${nodeKey}__${edgeKey}`;
  }

  get(key: string): any | null {
    return this.cache.get(key) || null;
  }

  set(key: string, value: any): void {
    // Implement LRU eviction
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Hook for debouncing expensive operations
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Hook for throttling function calls
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const lastRun = useRef(Date.now());

  return useMemo(
    () =>
      ((...args: Parameters<T>) => {
        if (Date.now() - lastRun.current >= delay) {
          lastRun.current = Date.now();
          return callback(...args);
        }
      }) as T,
    [callback, delay]
  );
}

// Virtualization helper to determine visible nodes
export function getVisibleNodes(
  nodes: any[],
  viewport: { x: number; y: number; zoom: number },
  containerWidth: number,
  containerHeight: number,
  buffer: number = 100
): Set<string> {
  const visibleNodeIds = new Set<string>();
  
  // Calculate viewport bounds with buffer
  const viewBounds = {
    left: -viewport.x / viewport.zoom - buffer,
    right: (-viewport.x + containerWidth) / viewport.zoom + buffer,
    top: -viewport.y / viewport.zoom - buffer,
    bottom: (-viewport.y + containerHeight) / viewport.zoom + buffer,
  };
  
  // Check each node if it's within viewport
  nodes.forEach(node => {
    const nodeRight = node.position.x + (node.width || 200);
    const nodeBottom = node.position.y + (node.height || 100);
    
    if (
      node.position.x <= viewBounds.right &&
      nodeRight >= viewBounds.left &&
      node.position.y <= viewBounds.bottom &&
      nodeBottom >= viewBounds.top
    ) {
      visibleNodeIds.add(node.id);
    }
  });
  
  return visibleNodeIds;
}

// Batch updates helper
export class BatchUpdater {
  private updates: (() => void)[] = [];
  private rafId: number | null = null;

  add(update: () => void): void {
    this.updates.push(update);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.flush();
      });
    }
  }

  private flush(): void {
    const updates = this.updates.slice();
    this.updates = [];
    this.rafId = null;
    
    updates.forEach(update => update());
  }

  clear(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.updates = [];
  }
}