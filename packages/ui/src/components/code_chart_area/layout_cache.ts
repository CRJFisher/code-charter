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
