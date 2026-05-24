interface LayoutInputNode {
  id: string;
  width?: number;
  height?: number;
  parentId?: string;
}

interface LayoutInputEdge {
  source: string;
  target: string;
}

// LRU cache keyed by graph topology + dimensions; values are layout outputs.
export class LayoutCache<T = unknown> {
  private cache = new Map<string, T>();
  private max_size = 50;

  generate_key(nodes: LayoutInputNode[], edges: LayoutInputEdge[]): string {
    // Key captures layout inputs only: IDs, dimensions, parent relationships.
    // Positions are excluded because they are layout outputs.
    const node_key = nodes
      .map(n => `${n.id}:${n.width ?? 0}:${n.height ?? 0}:${n.parentId ?? ''}`)
      .sort()
      .join('|');
    const edge_key = edges
      .map(e => `${e.source}-${e.target}`)
      .sort()
      .join('|');
    return `${node_key}__${edge_key}`;
  }

  get(key: string): T | null {
    const value = this.cache.get(key);
    if (value === undefined) {
      return null;
    }
    // Promote to most-recent position for LRU
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    // Delete existing entry first to avoid spurious eviction when updating
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.max_size) {
      // Evict least recently used (first entry in Map iteration order)
      const first_key = this.cache.keys().next().value;
      if (first_key !== undefined) {
        this.cache.delete(first_key);
      }
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
