import { MockBackend } from './mock_backend';
import type { SymbolId } from '@code-charter/types';

describe('MockBackend', () => {
  let backend: MockBackend;

  beforeEach(() => {
    backend = new MockBackend();
  });

  describe('get_call_graph', () => {
    it('returns a call graph with nodes and entry_points', async () => {
      const result = await backend.get_call_graph();
      if (!result) throw new Error('expected call graph');
      expect(result.nodes).toBeInstanceOf(Map);
      expect(result.nodes.size).toBe(3);
      expect(result.entry_points).toEqual(['main.ts:main']);
    });

    it('returns nodes with correct structure', async () => {
      const result = await backend.get_call_graph();
      if (!result) throw new Error('expected call graph');
      const main_node = result.nodes.get('main.ts:main' as SymbolId);
      if (!main_node) throw new Error('expected main node');
      expect(main_node.symbol_id).toBe('main.ts:main');
      expect(main_node.definition).toBeDefined();
      expect(main_node.enclosed_calls.map((c) => c.resolutions[0].symbol_id)).toEqual([
        'utils.ts:processData',
        'api.ts:fetch_data',
      ]);
    });

    it('keys each node in the map by its own symbol_id', async () => {
      const result = await backend.get_call_graph();
      if (!result) throw new Error('expected call graph');
      for (const [id, node] of result.nodes) {
        expect(node.symbol_id).toBe(id);
      }
    });
  });

  describe('list_flows', () => {
    it('returns a deterministic skeleton flow for the entrypoint', async () => {
      const result = await backend.list_flows();
      expect(result.length).toBe(1);
      expect(result[0].label).toBe('main');
      expect(result[0].is_hydrated).toBe(false);
      expect(result[0].member_count).toBe(3);
      expect(result[0].seed_location).toEqual({ file_path: 'main.ts', line_number: 0 });
    });
  });

  describe('render_flow', () => {
    it('returns adapter-ready rows: code.function leaves, module groups, and call edges', async () => {
      const result = await backend.render_flow('main.ts#main:function');
      const functions = result.nodes.filter((n) => n.kind === 'code.function');
      const groups = result.nodes.filter((n) => n.kind === 'agentic.group');
      expect(functions.map((n) => n.attributes.label).sort()).toEqual(['fetch_data', 'main', 'processData']);
      expect(groups.length).toBe(3);
      // every contains edge folds a real leaf into a real emitted module
      const ids = new Set(result.nodes.map((n) => n.id));
      for (const edge of result.edges.filter((e) => e.kind === 'agentic.contains')) {
        expect(ids.has(edge.src_id)).toBe(true);
        expect(ids.has(edge.dst_id)).toBe(true);
      }
      expect(result.edges.some((e) => e.kind === 'code.calls')).toBe(true);
    });

    it('marks only the entry-point leaf with is_entry_point', async () => {
      const result = await backend.render_flow('main.ts#main:function');
      const functions = result.nodes.filter((n) => n.kind === 'code.function');
      const flagged = functions.filter((n) => n.attributes.is_entry_point === true);
      expect(flagged.map((n) => n.attributes.label)).toEqual(['main']);
    });

    it('points every call edge at an emitted leaf node', async () => {
      const result = await backend.render_flow('main.ts#main:function');
      const leaf_ids = new Set(result.nodes.filter((n) => n.kind === 'code.function').map((n) => n.id));
      const call_edges = result.edges.filter((e) => e.kind === 'code.calls');
      expect(call_edges.length).toBe(3);
      for (const edge of call_edges) {
        expect(leaf_ids.has(edge.src_id)).toBe(true);
        expect(leaf_ids.has(edge.dst_id)).toBe(true);
      }
    });
  });

  describe('navigate_to_doc', () => {
    it('resolves without error', async () => {
      await expect(backend.navigate_to_doc('src/test.ts', 42)).resolves.toBeUndefined();
    });
  });
});
