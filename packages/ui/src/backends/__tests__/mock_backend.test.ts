import { MockBackend } from '../mock_backend';
import { ConnectionStatus } from '@code-charter/types';

describe('MockBackend', () => {
  let backend: MockBackend;

  beforeEach(() => {
    backend = new MockBackend();
  });

  describe('connection lifecycle', () => {
    it('starts in DISCONNECTED state', () => {
      const state = backend.getState();
      expect(state.status).toBe(ConnectionStatus.DISCONNECTED);
    });

    it('connect() transitions to CONNECTED', async () => {
      await backend.connect();
      expect(backend.getState().status).toBe(ConnectionStatus.CONNECTED);
    });

    it('disconnect() transitions back to DISCONNECTED', async () => {
      await backend.connect();
      await backend.disconnect();
      expect(backend.getState().status).toBe(ConnectionStatus.DISCONNECTED);
    });

    it('onStateChange() notifies listeners of state transitions', async () => {
      const callback = jest.fn();
      backend.onStateChange(callback);

      await backend.connect();

      // Should have been called with CONNECTING and then CONNECTED
      expect(callback).toHaveBeenCalledWith({ status: ConnectionStatus.CONNECTING });
      expect(callback).toHaveBeenCalledWith({ status: ConnectionStatus.CONNECTED });
    });

    it('onStateChange() unsubscribe stops notifications', async () => {
      const callback = jest.fn();
      const unsubscribe = backend.onStateChange(callback);

      unsubscribe();
      await backend.connect();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('getCallGraph()', () => {
    it('returns a CallGraph with nodes as a Map and edges as an array', async () => {
      const result = await backend.getCallGraph();
      expect(result).toBeDefined();
      expect(result!.nodes).toBeInstanceOf(Map);
      expect(Array.isArray(result!.edges)).toBe(true);
    });

    it('returns nodes with expected structure', async () => {
      const result = await backend.getCallGraph();
      const nodes = result!.nodes;

      expect(nodes.size).toBeGreaterThan(0);

      for (const [symbol, node] of nodes) {
        expect(node).toHaveProperty('symbol');
        expect(node).toHaveProperty('definition');
        expect(node).toHaveProperty('calls');
        expect(node).toHaveProperty('called_by');
        expect(node.symbol).toBe(symbol);
      }
    });

    it('returns edges with from/to properties', async () => {
      const result = await backend.getCallGraph();
      const edges = result!.edges;

      expect(edges.length).toBeGreaterThan(0);

      for (const edge of edges) {
        expect(edge).toHaveProperty('from');
        expect(edge).toHaveProperty('to');
      }
    });
  });

  describe('summariseCodeTree()', () => {
    it('returns TreeAndContextSummaries for a given symbol', async () => {
      const result = await backend.summariseCodeTree('main.ts:main');
      expect(result).toBeDefined();
      expect(result).toHaveProperty('functionSummaries');
      expect(result).toHaveProperty('refinedFunctionSummaries');
      expect(result).toHaveProperty('callTreeWithFilteredOutNodes');
      expect(result).toHaveProperty('contextSummary');
    });

    it('includes the requested symbol in summaries', async () => {
      const symbol = 'main.ts:main';
      const result = await backend.summariseCodeTree(symbol);
      expect(result!.functionSummaries[symbol]).toBeDefined();
      expect(result!.refinedFunctionSummaries[symbol]).toBeDefined();
    });
  });

  describe('clusterCodeTree()', () => {
    it('returns an array of NodeGroup objects', async () => {
      const result = await backend.clusterCodeTree('main.ts:main');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      for (const group of result) {
        expect(group).toHaveProperty('description');
        expect(group).toHaveProperty('memberSymbols');
        expect(Array.isArray(group.memberSymbols)).toBe(true);
      }
    });
  });

  describe('navigateToDoc()', () => {
    it('accepts two positional args (relativeDocPath, lineNumber) and returns void', async () => {
      const result = await backend.navigateToDoc('src/test.ts', 42);
      expect(result).toBeUndefined();
    });
  });
});
