import { MockBackend } from '../mock_backend';
import { CallGraph } from '@ariadnejs/types';

describe('MockBackend', () => {
  const mockCallGraph: CallGraph = {
    nodes: {
      'test': {
        symbol: 'test',
        label: 'test',
        file_path: 'test.ts',
        line_number: 1,
        docstring: 'Test function',
      },
    },
    edges: [],
  };

  it('returns configured call graph', async () => {
    const backend = new MockBackend({
      callGraph: mockCallGraph,
    });

    const result = await backend.getCallGraph();
    expect(result).toEqual(mockCallGraph);
  });

  it('returns configured summaries', async () => {
    const summaries = {
      'test': 'Test summary',
    };
    
    const backend = new MockBackend({
      refinedSummaries: summaries,
    });

    const result = await backend.summariseCodeTree('test');
    expect(result.refinedFunctionSummaries).toEqual(summaries);
  });

  it('throws error when configured to do so', async () => {
    const backend = new MockBackend({
      shouldThrowError: true,
    });

    await expect(backend.getCallGraph()).rejects.toThrow('Mock error');
  });

  it('simulates delay when configured', async () => {
    const delay = 100;
    const backend = new MockBackend({
      callGraph: mockCallGraph,
      delay,
    });

    const start = Date.now();
    await backend.getCallGraph();
    const end = Date.now();

    expect(end - start).toBeGreaterThanOrEqual(delay);
  });

  it('returns empty clusters by default', async () => {
    const backend = new MockBackend();
    
    const result = await backend.clusterCodeTree('test');
    expect(result).toEqual([]);
  });

  it('handles navigation calls', async () => {
    const backend = new MockBackend();
    
    const result = await backend.navigateToDoc({
      relativeDocPath: 'test.ts',
      lineNumber: 10,
    });

    expect(result).toEqual({ success: true });
  });

  it('returns empty function summary status', async () => {
    const backend = new MockBackend();
    
    const result = await backend.functionSummaryStatus('test');
    expect(result).toEqual({});
  });

  it('provides default empty data when not configured', async () => {
    const backend = new MockBackend();
    
    const callGraph = await backend.getCallGraph();
    expect(callGraph.nodes).toEqual({});
    expect(callGraph.edges).toEqual([]);

    const summaries = await backend.summariseCodeTree('test');
    expect(summaries.refinedFunctionSummaries).toEqual({});
    expect(summaries.contextSummary).toBe('Mock context');
  });
});