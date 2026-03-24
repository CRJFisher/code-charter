// Layout cache for memoization
export class LayoutCache {
  private cache = new Map<string, any>();
  private maxSize = 50;

  generateKey(nodes: any[], edges: any[]): string {
    // Key captures layout inputs only: IDs, dimensions, parent relationships.
    // Positions are excluded because they are layout outputs.
    const nodeKey = nodes
      .map(n => `${n.id}:${n.width ?? 0}:${n.height ?? 0}:${n.parentId ?? ''}`)
      .sort()
      .join('|');
    const edgeKey = edges
      .map(e => `${e.source}-${e.target}`)
      .sort()
      .join('|');
    return `${nodeKey}__${edgeKey}`;
  }

  get(key: string): any | null {
    const value = this.cache.get(key);
    if (value === undefined) {
      return null;
    }
    // Promote to most-recent position for LRU
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: string, value: any): void {
    // Delete existing entry first to avoid spurious eviction when updating
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first entry in Map iteration order)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
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
