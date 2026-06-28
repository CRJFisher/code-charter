import { LayoutCache } from './layout_cache';

describe('LayoutCache', () => {
  it('caches and retrieves a value by key', () => {
    const cache = new LayoutCache<{ label: string }>();
    const nodes = [
      { id: '1', width: 200, height: 100 },
      { id: '2', width: 200, height: 100 },
    ];
    const edges = [{ source: '1', target: '2' }];

    const key = cache.generate_key(nodes, edges);
    const layout = { label: 'layouted' };

    cache.set(key, layout);
    expect(cache.get(key)).toEqual(layout);
    expect(cache.size()).toBe(1);
  });

  it('returns null for a key that was never set', () => {
    const cache = new LayoutCache();
    expect(cache.get('missing')).toBeNull();
  });

  it('overwrites an existing key without growing the cache', () => {
    const cache = new LayoutCache<number>();
    cache.set('k', 1);
    cache.set('k', 2);

    expect(cache.get('k')).toBe(2);
    expect(cache.size()).toBe(1);
  });

  it('empties the cache on clear', () => {
    const cache = new LayoutCache<number>();
    cache.set('a', 1);
    cache.set('b', 2);

    cache.clear();

    expect(cache.size()).toBe(0);
    expect(cache.get('a')).toBeNull();
  });

  it('generates an identical key regardless of node order', () => {
    const cache = new LayoutCache();
    const nodes1 = [
      { id: '2', width: 200, height: 100 },
      { id: '1', width: 200, height: 100 },
    ];
    const nodes2 = [
      { id: '1', width: 200, height: 100 },
      { id: '2', width: 200, height: 100 },
    ];
    const edges = [{ source: '1', target: '2' }];

    expect(cache.generate_key(nodes1, edges)).toBe(cache.generate_key(nodes2, edges));
  });

  it('generates an identical key regardless of edge order', () => {
    const cache = new LayoutCache();
    const nodes = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const edges1 = [
      { source: '1', target: '2' },
      { source: '2', target: '3' },
    ];
    const edges2 = [
      { source: '2', target: '3' },
      { source: '1', target: '2' },
    ];

    expect(cache.generate_key(nodes, edges1)).toBe(cache.generate_key(nodes, edges2));
  });

  it('evicts the least recently used entry once full, honouring get() promotion', () => {
    const cache = new LayoutCache<{ data: number }>();

    for (let i = 0; i < 50; i++) {
      cache.set(`key-${i}`, { data: i });
    }
    expect(cache.size()).toBe(50);

    expect(cache.get('key-0')).toEqual({ data: 0 });

    cache.set('key-50', { data: 50 });

    expect(cache.size()).toBe(50);
    expect(cache.get('key-0')).toEqual({ data: 0 });
    expect(cache.get('key-1')).toBeNull();
    expect(cache.get('key-50')).toEqual({ data: 50 });
  });

  it('ignores node positions when deriving the key', () => {
    const cache = new LayoutCache();
    const nodes_before = [
      { id: '1', width: 200, height: 100, position: { x: 0, y: 0 } },
      { id: '2', width: 200, height: 100, position: { x: 0, y: 0 } },
    ];
    const nodes_after = [
      { id: '1', width: 200, height: 100, position: { x: 50, y: 120 } },
      { id: '2', width: 200, height: 100, position: { x: 300, y: 400 } },
    ];
    const edges = [{ source: '1', target: '2' }];

    expect(cache.generate_key(nodes_before, edges)).toBe(cache.generate_key(nodes_after, edges));
  });

  it('derives different keys when parentId differs', () => {
    const cache = new LayoutCache();
    const nodes1 = [{ id: '1', width: 200, height: 100, parentId: 'module-a' }];
    const nodes2 = [{ id: '1', width: 200, height: 100, parentId: 'module-b' }];

    expect(cache.generate_key(nodes1, [])).not.toBe(cache.generate_key(nodes2, []));
  });

  it('derives different keys when dimensions differ', () => {
    const cache = new LayoutCache();
    const nodes1 = [{ id: '1', width: 200, height: 100 }];
    const nodes2 = [{ id: '1', width: 300, height: 150 }];

    expect(cache.generate_key(nodes1, [])).not.toBe(cache.generate_key(nodes2, []));
  });

  it('treats absent dimensions as zero when deriving the key', () => {
    const cache = new LayoutCache();
    const without_dims = [{ id: '1' }];
    const zero_dims = [{ id: '1', width: 0, height: 0, parentId: '' }];

    expect(cache.generate_key(without_dims, [])).toBe(cache.generate_key(zero_dims, []));
  });
});
