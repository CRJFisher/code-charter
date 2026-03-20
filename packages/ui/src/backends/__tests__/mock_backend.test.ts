import { TestMockBackend } from '../test_mock_backend';
import type { CallGraph, CallableNode, SymbolId, SymbolName, FilePath, ScopeId, AnyDefinition } from '@ariadnejs/types';

function make_mock_call_graph(): CallGraph {
  const node: CallableNode = {
    symbol_id: "function:test.ts:1:0:10:0:test" as SymbolId,
    name: "test" as SymbolName,
    enclosed_calls: [],
    location: { file_path: "test.ts" as FilePath, start_line: 1, start_column: 0, end_line: 10, end_column: 0 },
    definition: {
      kind: "function",
      symbol_id: "function:test.ts:1:0:10:0:test" as SymbolId,
      name: "test" as SymbolName,
      defining_scope_id: "global:test.ts:0:0:100:0" as ScopeId,
      location: { file_path: "test.ts" as FilePath, start_line: 1, start_column: 0, end_line: 10, end_column: 0 },
      is_exported: false,
      signature: { parameters: [] },
      body_scope_id: "function:test.ts:1:0:10:0" as ScopeId,
    } as AnyDefinition,
    is_test: false,
  };

  const nodes = new Map<SymbolId, CallableNode>();
  nodes.set(node.symbol_id, node);

  return {
    nodes,
    entry_points: [node.symbol_id],
  };
}

describe('TestMockBackend', () => {
  const mockCallGraph = make_mock_call_graph();

  it('returns configured call graph', async () => {
    const backend = new TestMockBackend({
      callGraph: mockCallGraph,
    });

    const result = await backend.getCallGraph();
    expect(result).toEqual(mockCallGraph);
  });

  it('returns configured summaries', async () => {
    const summaries = {
      'test': 'Test summary',
    };

    const backend = new TestMockBackend({
      refinedSummaries: summaries,
    });

    const result = await backend.summariseCodeTree('test');
    expect(result!.refinedFunctionSummaries).toEqual(summaries);
  });

  it('throws error when configured to do so', async () => {
    const backend = new TestMockBackend({
      shouldThrowError: true,
    });

    await expect(backend.getCallGraph()).rejects.toThrow('Mock error');
  });

  it('simulates delay when configured', async () => {
    const delay = 100;
    const backend = new TestMockBackend({
      callGraph: mockCallGraph,
      delay,
    });

    const start = Date.now();
    await backend.getCallGraph();
    const end = Date.now();

    expect(end - start).toBeGreaterThanOrEqual(delay);
  });

  it('returns empty clusters by default', async () => {
    const backend = new TestMockBackend();

    const result = await backend.clusterCodeTree('test');
    expect(result).toEqual([]);
  });

  it('handles navigation calls', async () => {
    const backend = new TestMockBackend();

    // navigateToDoc now takes two positional args
    await expect(backend.navigateToDoc('test.ts', 10)).resolves.not.toThrow();
  });

  it('provides default empty data when not configured', async () => {
    const backend = new TestMockBackend();

    const callGraph = await backend.getCallGraph();
    expect(callGraph!.nodes.size).toBe(0);
    expect(callGraph!.entry_points).toEqual([]);

    const summaries = await backend.summariseCodeTree('test');
    expect(summaries!.refinedFunctionSummaries).toEqual({});
    expect(summaries!.contextSummary).toBe('Mock context');
  });
});
