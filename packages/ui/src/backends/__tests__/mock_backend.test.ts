import { MockBackend } from '../mock_backend';

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
      const nodes_array = Array.from(result!.nodes.values());
      const main_node = nodes_array.find(n => n.name === 'main');
      expect(main_node).toBeDefined();
      expect(main_node!.symbol_id).toBeDefined();
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

  describe('summariseCodeTree', () => {
    it('returns summaries for a function', async () => {
      const result = await backend.summariseCodeTree('main.ts:main');
      expect(result).toBeDefined();
      expect(result!.functionSummaries).toBeDefined();
      expect(result!.refinedFunctionSummaries).toBeDefined();
      expect(result!.contextSummary).toBeDefined();
      expect(result!.callTreeWithFilteredOutNodes).toBeDefined();
    });
  });

  describe('navigateToDoc', () => {
    it('resolves without error', async () => {
      await expect(backend.navigateToDoc('src/test.ts', 42)).resolves.toBeUndefined();
    });
  });
});
