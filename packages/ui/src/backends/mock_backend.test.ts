import { MockBackend } from './mock_backend';

describe('MockBackend', () => {
  let backend: MockBackend;

  beforeEach(() => {
    backend = new MockBackend();
  });

  describe('getCallGraph', () => {
    it('returns a call graph with nodes and entry_points', async () => {
      const result = await backend.getCallGraph();
      expect(result).toBeDefined();
      expect(result!.nodes).toBeInstanceOf(Map);
      expect(result!.nodes.size).toBe(3);
      expect(result!.entry_points.length).toBe(1);
    });

    it('returns nodes with correct structure', async () => {
      const result = await backend.getCallGraph();
      const main_node = result!.nodes.get('main.ts:main' as any);
      expect(main_node).toBeDefined();
      expect(main_node!.symbol_id).toBe('main.ts:main');
      expect(main_node!.definition).toBeDefined();
      expect(main_node!.enclosed_calls.length).toBe(2);
    });
  });

  describe('clusterCodeTree', () => {
    it('returns node groups', async () => {
      const result = await backend.clusterCodeTree('main.ts:main');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
      expect(result[0].description).toBeDefined();
      expect(Array.isArray(result[0].memberSymbols)).toBe(true);
    });
  });

  describe('get_code_tree_descriptions', () => {
    it('returns docstring descriptions for a function', async () => {
      const result = await backend.get_code_tree_descriptions('main.ts:main');
      expect(result).toBeDefined();
      expect(result!.docstrings).toBeDefined();
      expect(result!.call_tree).toBeDefined();
      expect(result!.docstrings['main.ts:main']).toBeDefined();
    });
  });

  describe('navigateToDoc', () => {
    it('resolves without error', async () => {
      await expect(backend.navigateToDoc('src/test.ts', 42)).resolves.toBeUndefined();
    });
  });
});
